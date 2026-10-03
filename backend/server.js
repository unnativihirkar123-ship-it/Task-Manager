const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const db = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

const fail = (res, err, message, code = 500) => {
    console.error(err);
    return res.status(code).json({ message });
};

// "" / undefined -> null, otherwise a number (NaN if invalid)
const cleanHours = v => (v === undefined || v === null || v === "") ? null : Number(v);
const cleanTime = v => v ? String(v) : null;
const badHours = h => h !== null && (Number.isNaN(h) || h < 0 || h > 999);

app.get("/", (req, res) => {
    res.send("Task Manager Server is Running!");
});

/* ===================== CATEGORIES ===================== */

app.get("/categories", (req, res) => {
    db.query("SELECT * FROM categories", (err, result) => {
        if (err) return fail(res, err, "Error fetching categories.");
        res.json(result);
    });
});

app.post("/categories", (req, res) => {
    const name = (req.body.category_name || "").trim();

    if (!name) {
        return res.status(400).json({ message: "Category name is required." });
    }

    db.query(
        "INSERT INTO categories (category_name) VALUES (?)",
        [name],
        (err, result) => {
            if (err) return fail(res, err, "Error adding category.");
            res.json({
                message: "Category added successfully!",
                category_id: result.insertId
            });
        }
    );
});

app.delete("/categories/:id", (req, res) => {
    const { id } = req.params;

    // remove links first so the delete doesn't hit a foreign-key error
    db.query("DELETE FROM task_categories WHERE category_id = ?", [id], (err) => {
        if (err) return fail(res, err, "Error deleting category.");

        db.query("DELETE FROM categories WHERE category_id = ?", [id], (err) => {
            if (err) return fail(res, err, "Error deleting category.");
            res.json({ message: "Category deleted successfully!" });
        });
    });
});

/* ===================== TASKS ===================== */

app.get("/tasks", (req, res) => {
    const userId = req.query.user_id;

    if (!userId) {
        return res.status(400).json({ message: "User ID is required." });
    }

    // nearest deadline first; a task with no time is treated as due at end of day
    const sql = `
        SELECT
            tasks.*,
            task_categories.category_id,
            categories.category_name
        FROM tasks
        LEFT JOIN task_categories
            ON tasks.task_id = task_categories.task_id
        LEFT JOIN categories
            ON task_categories.category_id = categories.category_id
        WHERE tasks.user_id = ?
        ORDER BY tasks.due_date ASC,
                 COALESCE(tasks.due_time, '23:59:59') ASC,
                 tasks.task_id DESC
    `;

    db.query(sql, [userId], (err, results) => {
        if (err) return fail(res, err, "Error fetching tasks.");
        res.json(results);
    });
});

app.post("/tasks", (req, res) => {
    const {
        project_id, title, description, priority,
        status, due_date, due_time, est_hours, category_id, user_id
    } = req.body;

    if (!user_id) {
        return res.status(400).json({ message: "User ID is required." });
    }
    if (!title || !due_date) {
        return res.status(400).json({ message: "Title and due date are required." });
    }

    const hours = cleanHours(est_hours);
    if (badHours(hours)) {
        return res.status(400).json({ message: "Estimated hours must be a positive number." });
    }

    const taskSql = `
        INSERT INTO tasks
        (project_id, title, description, priority, status, due_date, due_time, est_hours, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
        taskSql,
        [project_id, title, description, priority, status, due_date, cleanTime(due_time), hours, user_id],
        (err, result) => {
            if (err) return fail(res, err, "Error adding task.");

            const taskId = result.insertId;

            if (!category_id) {
                return res.json({ message: "Task added successfully!", task_id: taskId });
            }

            db.query(
                "INSERT INTO task_categories (task_id, category_id) VALUES (?, ?)",
                [taskId, category_id],
                (err) => {
                    if (err) return fail(res, err, "Task added, but category failed.");
                    res.json({ message: "Task added successfully!", task_id: taskId });
                }
            );
        }
    );
});

app.put("/tasks/:id", (req, res) => {
    const { id } = req.params;
    const { title, description, priority, status, due_date, due_time, est_hours, category_id } = req.body;

    const hours = cleanHours(est_hours);
    if (badHours(hours)) {
        return res.status(400).json({ message: "Estimated hours must be a positive number." });
    }

    const taskSql = `
        UPDATE tasks
        SET title = ?, description = ?, priority = ?, status = ?,
            due_date = ?, due_time = ?, est_hours = ?
        WHERE task_id = ?
    `;

    db.query(
        taskSql,
        [title, description, priority, status, due_date, cleanTime(due_time), hours, id],
        (err) => {
            if (err) return fail(res, err, "Error updating task.");

            // no category sent: keep the existing one
            if (!category_id) {
                return res.json({ message: "Task updated successfully!" });
            }

            db.query(
                "UPDATE task_categories SET category_id = ? WHERE task_id = ?",
                [category_id, id],
                (err, r) => {
                    if (err) return fail(res, err, "Error updating category.");

                    // old tasks may have no category row yet: create it
                    if (r.affectedRows === 0) {
                        return db.query(
                            "INSERT INTO task_categories (task_id, category_id) VALUES (?, ?)",
                            [id, category_id],
                            (err) => {
                                if (err) return fail(res, err, "Error updating category.");
                                res.json({ message: "Task updated successfully!" });
                            }
                        );
                    }

                    res.json({ message: "Task updated successfully!" });
                }
            );
        }
    );
});

app.delete("/tasks/:id", (req, res) => {
    const { id } = req.params;

    db.query("DELETE FROM task_categories WHERE task_id = ?", [id], (err) => {
        if (err) return fail(res, err, "Error deleting task.");

        db.query("DELETE FROM tasks WHERE task_id = ?", [id], (err) => {
            if (err) return fail(res, err, "Error deleting task.");
            res.json({ message: "Task deleted successfully!" });
        });
    });
});

/* ===================== AUTH ===================== */

app.post("/signup", async (req, res) => {
    const name = (req.body.name || "").trim();
    const email = (req.body.email || "").trim().toLowerCase();
    const password = req.body.password;

    if (!name || !email || !password) {
        return res.status(400).json({ message: "Please fill all fields." });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        db.query(
            "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
            [name, email, hashedPassword],
            (err) => {
                if (err) {
                    if (err.code === "ER_DUP_ENTRY") {
                        return res.status(409).json({ message: "Email already registered." });
                    }
                    return fail(res, err, "Error creating account.");
                }
                res.status(201).json({ message: "Account created successfully!" });
            }
        );
    } catch (error) {
        fail(res, error, "Error securing password.");
    }
});

app.post("/login", (req, res) => {
    const email = (req.body.email || "").trim().toLowerCase();
    const password = req.body.password;

    if (!email || !password) {
        return res.status(400).json({ message: "Please enter email and password." });
    }

    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
        if (err) return fail(res, err, "Server error.");

        if (results.length === 0) {
            return res.status(401).json({ message: "Invalid email or password." });
        }

        const user = results[0];

        try {
            const passwordMatch = await bcrypt.compare(password, user.password);

            if (!passwordMatch) {
                return res.status(401).json({ message: "Invalid email or password." });
            }

            res.json({
                message: "Login successful!",
                user: {
                    user_id: user.user_id,
                    name: user.name,
                    email: user.email
                }
            });
        } catch (error) {
            fail(res, error, "Login failed.");
        }
    });
});

/* ===================== PASSWORD RESET ===================== */
/* Render's free tier blocks SMTP ports, so the email goes out over
   Brevo's HTTPS API instead. Env vars needed on Render:
   BREVO_API_KEY, MAIL_FROM (a sender verified in Brevo), FRONTEND_URL (optional) */

const FRONTEND_URL = (process.env.FRONTEND_URL || "https://task-manager-frontend-xfen.onrender.com").replace(/\/$/, "");
const sha256 = s => crypto.createHash("sha256").update(s).digest("hex");
const escHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function sendResetEmail(to, name, link) {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
            "api-key": process.env.BREVO_API_KEY,
            "content-type": "application/json",
            accept: "application/json"
        },
        body: JSON.stringify({
            sender: { name: "Stintlist", email: process.env.MAIL_FROM },
            to: [{ email: to }],
            subject: "Reset your Stintlist password",
            htmlContent: `
                <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#1F2430">
                    <h2>Reset your password</h2>
                    <p>Hi ${escHtml(name)},</p>
                    <p>Click the button below to choose a new password. This link works for 30 minutes.</p>
                    <p><a href="${link}" style="display:inline-block;background:#C98A2B;color:#1F2430;
                        padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Choose a new password</a></p>
                    <p style="font-size:13px;color:#6B6558">If you didn't ask for this, you can ignore this email. Your password won't change.</p>
                </div>`
        })
    });

    if (!r.ok) throw new Error(`Brevo ${r.status}: ${await r.text()}`);
}

// Step 1: user enters their email, we send a reset link
app.post("/forgot-password", (req, res) => {
    const email = (req.body.email || "").trim().toLowerCase();

    if (!email) {
        return res.status(400).json({ message: "Please enter your email." });
    }

    // same answer whether or not the email exists, so nobody can probe for accounts
    const generic = { message: "If that email is registered, a reset link is on its way." };

    db.query("SELECT user_id, name FROM users WHERE email = ?", [email], (err, results) => {
        if (err) return fail(res, err, "Server error.");
        if (results.length === 0) return res.json(generic);

        const { user_id, name } = results[0];
        const token = crypto.randomBytes(32).toString("hex");

        // only a hash of the token is stored; the link holds the real token
        db.query(
            `UPDATE users
             SET reset_token = ?, reset_expires = DATE_ADD(NOW(), INTERVAL 30 MINUTE)
             WHERE user_id = ?`,
            [sha256(token), user_id],
            async (err) => {
                if (err) return fail(res, err, "Server error.");

                try {
                    await sendResetEmail(email, name, `${FRONTEND_URL}/reset-password.html?token=${token}`);
                    res.json(generic);
                } catch (error) {
                    fail(res, error, "Couldn't send the reset email. Please try again in a few minutes.");
                }
            }
        );
    });
});

// Step 2: user opens the link and sets a new password
app.post("/reset-password", async (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
        return res.status(400).json({ message: "Reset link and new password are required." });
    }
    if (String(password).length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        // one query: only succeeds if the token matches and hasn't expired
        db.query(
            `UPDATE users
             SET password = ?, reset_token = NULL, reset_expires = NULL
             WHERE reset_token = ? AND reset_expires > NOW()`,
            [hashedPassword, sha256(String(token))],
            (err, result) => {
                if (err) return fail(res, err, "Server error.");

                if (result.affectedRows === 0) {
                    return res.status(400).json({ message: "This reset link is invalid or has expired." });
                }

                res.json({ message: "Password updated. You can log in now." });
            }
        );
    } catch (error) {
        fail(res, error, "Error securing password.");
    }
});

/* ===================== EXAM PROGRESS ===================== */

// Get user's exam progress
app.get("/api/progress/:user_id", (req, res) => {
    const { user_id } = req.params;

    db.query(
        "SELECT * FROM user_progress WHERE user_id = ? ORDER BY exam_date ASC",
        [user_id],
        (err, results) => {
            if (err) return fail(res, err, "Error fetching progress.");
            res.json(results);
        }
    );
});

// Save or update user's exam details
app.post("/api/progress", (req, res) => {
    const { user_id, exam_name, exam_date } = req.body;

    if (!user_id || !exam_name || !exam_date) {
        return res.status(400).json({
            message: "User ID, exam name and exam date are required."
        });
    }

    // Check whether this user already has an exam
    db.query(
        "SELECT progress_id FROM user_progress WHERE user_id = ? LIMIT 1",
        [user_id],
        (err, results) => {
            if (err) {
                return fail(res, err, "Error checking exam progress.");
            }

            // If exam already exists -> update it
            if (results.length > 0) {
                const progressId = results[0].progress_id;

                db.query(
                    `UPDATE user_progress
                     SET exam_name = ?, exam_date = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE progress_id = ?`,
                    [exam_name.trim(), exam_date, progressId],
                    (err) => {
                        if (err) {
                            return fail(res, err, "Error updating exam progress.");
                        }

                        res.json({
                            message: "Exam details updated successfully!",
                            progress_id: progressId
                        });
                    }
                );

                return;
            }

            // If user has no exam -> create one
            db.query(
                `INSERT INTO user_progress
                 (user_id, exam_name, exam_date, study_streak, last_study_date)
                 VALUES (?, ?, ?, 0, NULL)`,
                [user_id, exam_name.trim(), exam_date],
                (err, result) => {
                    if (err) {
                        return fail(res, err, "Error saving exam progress.");
                    }

                    res.status(201).json({
                        message: "Exam saved successfully!",
                        progress_id: result.insertId
                    });
                }
            );
        }
    );
});

// Record today's study activity and update streak
app.post("/api/progress/study", async (req, res) => {
    try {
        const { user_id } = req.body;

        if (!user_id) {
            return res.status(400).json({
                message: "User ID is required"
            });
        }

        // Record today's study activity
        await db.promise().query(
            `INSERT INTO study_activity (user_id, study_date, completed)
             VALUES (?, CURDATE(), TRUE)
             ON DUPLICATE KEY UPDATE completed = TRUE`,
            [user_id]
        );

        // Get all study dates for this user
        const [rows] = await db.promise().query(
            `SELECT study_date
             FROM study_activity
             WHERE user_id = ?
             AND completed = TRUE
             ORDER BY study_date DESC`,
            [user_id]
        );

        // Calculate streak using date strings
        let streak = 0;
        let expectedDate = new Date();

        for (const row of rows) {
            const date = new Date(row.study_date);

            const expected = expectedDate.toISOString().split("T")[0];
            const actual = date.toISOString().split("T")[0];

            if (actual === expected) {
                streak++;
                expectedDate.setDate(expectedDate.getDate() - 1);
            } else {
                break;
            }
        }

        // Update user progress
        await db.promise().query(
            `UPDATE user_progress
             SET study_streak = ?,
                 last_study_date = CURDATE()
             WHERE user_id = ?`,
            [streak, user_id]
        );

        res.json({
            success: true,
            message: "Study activity recorded successfully",
            study_date: new Date().toISOString().split("T")[0],
            study_streak: streak
        });

    } catch (error) {
        console.error("Study activity error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to record study activity",
            error: error.message
        });
    }
});

// Manually update streak
app.post("/api/progress/update-streak", (req, res) => {
    const { user_id, study_streak } = req.body;

    if (!user_id || study_streak === undefined) {
        return res.status(400).json({
            message: "User ID and study streak are required."
        });
    }

    db.query(
        `UPDATE user_progress
         SET study_streak = ?
         WHERE user_id = ?`,
        [study_streak, user_id],
        (err) => {
            if (err) return fail(res, err, "Error updating streak.");

            res.json({
                message: "Study streak updated successfully!"
            });
        }
    );
});

// Get weekly study progress
app.get("/api/progress/week/:user_id", (req, res) => {
    const { user_id } = req.params;

    db.query(
        `SELECT *
         FROM study_activity
         WHERE user_id = ?
         AND study_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
         ORDER BY study_date ASC`,
        [user_id],
        (err, results) => {
            if (err) {
                return fail(res, err, "Error fetching weekly progress.");
            }

            res.json(results);
        }
    );
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
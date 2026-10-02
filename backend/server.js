const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");

const db = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

const fail = (res, err, message, code = 500) => {
    console.error(err);
    return res.status(code).json({ message });
};

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
        ORDER BY tasks.task_id DESC
    `;

    db.query(sql, [userId], (err, results) => {
        if (err) return fail(res, err, "Error fetching tasks.");
        res.json(results);
    });
});

app.post("/tasks", (req, res) => {
    const {
        project_id, title, description, priority,
        status, due_date, category_id, user_id
    } = req.body;

    if (!user_id) {
        return res.status(400).json({ message: "User ID is required." });
    }
    if (!title || !due_date) {
        return res.status(400).json({ message: "Title and due date are required." });
    }

    const taskSql = `
        INSERT INTO tasks
        (project_id, title, description, priority, status, due_date, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
        taskSql,
        [project_id, title, description, priority, status, due_date, user_id],
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
    const { title, description, priority, status, due_date, category_id } = req.body;

    const taskSql = `
        UPDATE tasks
        SET title = ?, description = ?, priority = ?, status = ?, due_date = ?
        WHERE task_id = ?
    `;

    db.query(
        taskSql,
        [title, description, priority, status, due_date, id],
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


// Save exam details
// Save or update user's exam details
app.post("/api/progress", (req, res) => {
    const {
        user_id,
        exam_name,
        exam_date
    } = req.body;

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

            // If exam already exists → update it
            if (results.length > 0) {
                const progressId = results[0].progress_id;

                db.query(
                    `UPDATE user_progress
                     SET exam_name = ?, exam_date = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE progress_id = ?`,
                    [exam_name.trim(), exam_date, progressId],
                    (err) => {
                        if (err) {
                            return fail(
                                res,
                                err,
                                "Error updating exam progress."
                            );
                        }

                        res.json({
                            message: "Exam details updated successfully!",
                            progress_id: progressId
                        });
                    }
                );

                return;
            }

            // If user has no exam → create one
            db.query(
                `INSERT INTO user_progress
                 (user_id, exam_name, exam_date, study_streak, last_study_date)
                 VALUES (?, ?, ?, 0, NULL)`,
                [user_id, exam_name.trim(), exam_date],
                (err, result) => {
                    if (err) {
                        return fail(
                            res,
                            err,
                            "Error saving exam progress."
                        );
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


/// Record today's study activity and update streak

app.post("/api/progress/study", async (req, res) => {
    try {
        const { user_id } = req.body;

        if (!user_id) {
            return res.status(400).json({
                message: "User ID is required"
            });
        }

        const today = new Date().toISOString().split("T")[0];

        // 1. Save today's study activity
        await db.promise().query(
            `INSERT INTO study_activity (user_id, study_date, completed)
             VALUES (?, ?, TRUE)
             ON DUPLICATE KEY UPDATE completed = TRUE`,
            [user_id, today]
        );

        // 2. Get all completed study dates
        const [rows] = await db.promise().query(
            `SELECT study_date
             FROM study_activity
             WHERE user_id = ? AND completed = TRUE
             ORDER BY study_date DESC`,
            [user_id]
        );

        // 3. Calculate current streak
        let streak = 0;
        let checkDate = new Date(today);

        for (const row of rows) {
            const studyDate = String(row.study_date).substring(0, 10);
            const expectedDate = checkDate.toISOString().split("T")[0];

            if (studyDate === expectedDate) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else if (studyDate < expectedDate) {
                break;
            }
        }

        // 4. Create progress row if user doesn't have one
        await db.promise().query(
            `INSERT INTO user_progress
             (user_id, study_streak, last_study_date)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE
             study_streak = VALUES(study_streak),
             last_study_date = VALUES(last_study_date)`,
            [user_id, streak, today]
        );

        res.json({
            success: true,
            message: "Study activity recorded successfully",
            study_date: today,
            study_streak: streak
        });

    } catch (error) {
        console.error("Study activity error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to record study activity"
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
                return fail(
                    res,
                    err,
                    "Error fetching weekly progress."
                );
            }

            res.json(results);
        }
    );
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
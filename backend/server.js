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

    db.query(
        `INSERT INTO user_progress
        (user_id, exam_name, exam_date, study_streak, last_study_date)
        VALUES (?, ?, ?, 0, NULL)`,
        [user_id, exam_name, exam_date],
        (err, result) => {
            if (err) return fail(res, err, "Error saving exam progress.");

            res.status(201).json({
                message: "Exam progress saved successfully!",
                progress_id: result.insertId
            });
        }
    );
});


// Record today's study activity
app.post("/api/progress/study", (req, res) => {
    const { user_id } = req.body;

    if (!user_id) {
        return res.status(400).json({
            message: "User ID is required."
        });
    }

    db.query(
        `SELECT * FROM user_progress
         WHERE user_id = ?
         ORDER BY progress_id DESC
         LIMIT 1`,
        [user_id],
        (err, results) => {
            if (err) return fail(res, err, "Error checking progress.");

            if (results.length === 0) {
                return res.status(404).json({
                    message: "No exam progress found."
                });
            }

            const progress = results[0];

            const today = new Date().toISOString().split("T")[0];

            if (
                progress.last_study_date &&
                new Date(progress.last_study_date)
                    .toISOString()
                    .split("T")[0] === today
            ) {
                return res.json({
                    message: "Today's study is already recorded.",
                    study_streak: progress.study_streak
                });
            }

            let newStreak = progress.study_streak || 0;

            if (progress.last_study_date) {
                const lastDate = new Date(progress.last_study_date);
                const todayDate = new Date(today);

                const difference =
                    Math.floor(
                        (todayDate - lastDate) /
                        (1000 * 60 * 60 * 24)
                    );

                if (difference === 1) {
                    newStreak++;
                } else {
                    newStreak = 1;
                }
            } else {
                newStreak = 1;
            }

            db.query(
                `UPDATE user_progress
                 SET study_streak = ?, last_study_date = ?
                 WHERE progress_id = ?`,
                [newStreak, today, progress.progress_id],
                (err) => {
                    if (err) {
                        return fail(
                            res,
                            err,
                            "Error updating study streak."
                        );
                    }

                    res.json({
                        message: "Study activity recorded!",
                        study_streak: newStreak
                    });
                }
            );
        }
    );
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
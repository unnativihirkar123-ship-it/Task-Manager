
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");

const db = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Task Manager Server is Running!");
});
app.get("/categories", (req, res) => {

    const sql = "SELECT * FROM categories";

    db.query(sql, (err, result) => {

        if (err) {
            return res.status(500).json(err);
        }

        res.json(result);
    });
});

app.post("/categories", (req, res) => {

    const { category_name } = req.body;

    const sql = `
        INSERT INTO categories (category_name)
        VALUES (?)
    `;

    db.query(sql, [category_name], (err, result) => {

        if (err) {
            return res.status(500).json(err);
        }

        res.json({
            message: "Category added successfully!",
            category_id: result.insertId
        });
    });
});


app.delete("/categories/:id", (req, res) => {

    const { id } = req.params;

    const sql = `
        DELETE FROM categories
        WHERE category_id = ?
    `;

    db.query(sql, [id], (err, result) => {

        if (err) {
            return res.status(500).json(err);
        }

        res.json({
            message: "Category deleted successfully!"
        });
    });
});

app.get("/tasks", (req, res) => {

    const userId = req.query.user_id;

    if (!userId) {
        return res.status(400).json({
            message: "User ID is required."
        });
    }

    const sql = `
        SELECT 
            tasks.*,
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

        if (err) {
            console.error(err);

            return res.status(500).json({
                message: "Error fetching tasks."
            });
        }

        res.json(results);
    });

});
app.post("/tasks", (req, res) => {

    const {
        project_id,
        title,
        description,
        priority,
        status,
        due_date,
        category_id,
        user_id
    } = req.body;

    if (!user_id) {
        return res.status(400).json({
            message: "User ID is required."
        });
    }

    const taskSql = `
        INSERT INTO tasks
        (project_id, title, description, priority, status, due_date, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
        taskSql,
        [
            project_id,
            title,
            description,
            priority,
            status,
            due_date,
            user_id
        ],
        (err, result) => {

            if (err) {
                console.error(err);
                return res.status(500).json(err);
            }

            const taskId = result.insertId;

            const categorySql = `
                INSERT INTO task_categories
                (task_id, category_id)
                VALUES (?, ?)
            `;

            db.query(
                categorySql,
                [taskId, category_id],
                (err) => {

                    if (err) {
                        console.error(err);
                        return res.status(500).json(err);
                    }

                    res.json({
                        message: "Task added successfully!",
                        task_id: taskId
                    });

                }
            );

        }
    );

});

app.put("/tasks/:id", (req, res) => {

    const { id } = req.params;

    const {
        title,
        description,
        priority,
        status,
        due_date,
        category_id
    } = req.body;

    const taskSql = `
        UPDATE tasks
        SET title = ?,
            description = ?,
            priority = ?,
            status = ?,
            due_date = ?
        WHERE task_id = ?
    `;

    db.query(
        taskSql,
        [
            title,
            description,
            priority,
            status,
            due_date,
            id
        ],
        (err) => {

            if (err) {
                return res.status(500).json(err);
            }

            const categorySql = `
                UPDATE task_categories
                SET category_id = ?
                WHERE task_id = ?
            `;

            db.query(
                categorySql,
                [category_id, id],
                (err) => {

                    if (err) {
                        return res.status(500).json(err);
                    }

                    res.json({
                        message: "Task updated successfully!"
                    });
                }
            );
        }
    );
});

app.delete("/tasks/:id", (req, res) => {

    const { id } = req.params;

    const categorySql = `
        DELETE FROM task_categories
        WHERE task_id = ?
    `;

    db.query(
        categorySql,
        [id],
        (err) => {

            if (err) {
                return res.status(500).json(err);
            }

            const taskSql = `
                DELETE FROM tasks
                WHERE task_id = ?
            `;

            db.query(
                taskSql,
                [id],
                (err) => {

                    if (err) {
                        return res.status(500).json(err);
                    }

                    res.json({
                        message: "Task deleted successfully!"
                    });
                }
            );
        }
    );
});
app.post("/signup", async (req, res) => {

    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({
            message: "Please fill all fields."
        });
    }

    try {

        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = `
            INSERT INTO users (name, email, password)
            VALUES (?, ?, ?)
        `;

        db.query(
            sql,
            [name, email, hashedPassword],
            (err, result) => {

                if (err) {

                    if (err.code === "ER_DUP_ENTRY") {
                        return res.status(409).json({
                            message: "Email already registered."
                        });
                    }

                    console.error(err);

                    return res.status(500).json({
                        message: "Error creating account."
                    });
                }

                res.status(201).json({
                    message: "Account created successfully!"
                });

            }
        );

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Error securing password."
        });

    }

});
app.post("/login", async (req, res) => {

    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            message: "Please enter email and password."
        });
    }

    const sql = "SELECT * FROM users WHERE email = ?";

    db.query(sql, [email], async (err, results) => {

        if (err) {
            console.error(err);

            return res.status(500).json({
                message: "Server error."
            });
        }

        if (results.length === 0) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const user = results[0];

        try {

            const passwordMatch =
                await bcrypt.compare(password, user.password);

            if (!passwordMatch) {
                return res.status(401).json({
                    message: "Invalid email or password."
                });
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

            console.error(error);

            res.status(500).json({
                message: "Login failed."
            });

        }

    });

});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});


const taskForm = document.getElementById("taskForm");
const taskList = document.getElementById("taskList");
const editForm = document.getElementById("editForm");
const searchTask = document.getElementById("searchTask");
const statusFilter = document.getElementById("statusFilter");
const categoryForm = document.getElementById("categoryForm");
const categoryList = document.getElementById("categoryList");
const priorityFilter = document.getElementById("priorityFilter");
const sortTasks = document.getElementById("sortTasks");

let allTasks = [];
let deleteTaskId = null;
taskForm.addEventListener("submit", async function (event) {

    event.preventDefault();

    const user = JSON.parse(localStorage.getItem("user"));

    if (!user) {
        window.location.href = "login.html";
        return;
    }

    const taskData = {
        project_id: 1,
        title: document.getElementById("title").value,
        description: document.getElementById("description").value,
        priority: document.getElementById("priority").value,
        status: document.getElementById("status").value,
        due_date: document.getElementById("due_date").value,
        category_id: document.getElementById("category").value,
        user_id: user.user_id
    };

    try {

        const response = await fetch(
            "http://localhost:3000/tasks",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify(taskData)
            }
        );

        const result = await response.json();

        if (!response.ok) {
            alert(result.message || "Error adding task.");
            return;
        }

        alert(result.message);

        taskForm.reset();

        document.getElementById("priority").value = "Medium";
        document.getElementById("status").value = "Pending";

        loadTasks();

    } catch (error) {

        console.error("Error adding task:", error);

        alert("Unable to connect to server.");

    }

});

async function loadCategories() {
    try {
        const response = await fetch("http://localhost:3000/categories");
        const categories = await response.json();

        const categorySelect = document.getElementById("category");
        const editCategorySelect = document.getElementById("editCategory");

        categorySelect.innerHTML = "";
        editCategorySelect.innerHTML = "";

        categories.forEach(category => {

            categorySelect.innerHTML += `
                <option value="${category.category_id}">
                    ${category.category_name}
                </option>
            `;

            editCategorySelect.innerHTML += `
                <option value="${category.category_id}">
                    ${category.category_name}
                </option>
            `;
        });

    } catch (error) {
        console.error("Error loading categories:", error);
    }
}

async function displayCategories() {

    try {

        const response =
            await fetch("http://localhost:3000/categories");

        const categories =
            await response.json();

        categoryList.innerHTML = "";

        categories.forEach(category => {

            categoryList.innerHTML += `
                <div class="category-item">

                    <span>🏷️ ${category.category_name}</span>

                    <button
                        onclick="deleteCategory(${category.category_id})">
                        🗑️
                    </button>

                </div>
            `;
        });

    } catch (error) {

        console.error(
            "Error loading categories:",
            error
        );
    }
}


categoryForm.addEventListener(
    "submit",
    async function (event) {

        event.preventDefault();

        const categoryName =
            document.getElementById("categoryName").value;

        try {

            const response =
                await fetch(
                    "http://localhost:3000/categories",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type": "application/json"
                        },

                        body: JSON.stringify({
                            category_name: categoryName
                        })
                    }
                );

            const result =
                await response.json();

            alert(result.message);

            categoryForm.reset();

            await displayCategories();

            await loadCategories();

        } catch (error) {

            console.error(
                "Error adding category:",
                error
            );
        }
    }
);


async function deleteCategory(id) {

    try {

        const response =
            await fetch(
                `http://localhost:3000/categories/${id}`,
                {
                    method: "DELETE"
                }
            );

        const result =
            await response.json();

        alert(result.message);

        displayCategories();

        loadCategories();

    } catch (error) {

        console.error(
            "Error deleting category:",
            error
        );
    }
}

function updateDashboard() {

    const total = allTasks.length;

    const completed =
        allTasks.filter(task =>
            task.status === "Completed"
        ).length;

    const progress =
        allTasks.filter(task =>
            task.status === "In Progress"
        ).length;

    const pending =
        allTasks.filter(task =>
            task.status === "Pending"
        ).length;

    document.getElementById("totalTasks").textContent = total;

    document.getElementById("completedTasks").textContent = completed;

    document.getElementById("progressTasks").textContent = progress;

    document.getElementById("pendingTasks").textContent = pending;

    const percentage =
        total === 0
            ? 0
            : Math.round((completed / total) * 100);

    document.getElementById("progressPercentage")
        .textContent = percentage + "%";

    document.getElementById("progressFill")
        .style.width = percentage + "%";

    document.getElementById("progressText")
        .textContent =
        `${completed} of ${total} tasks completed`;
}

async function loadTasks() {

    const user = JSON.parse(localStorage.getItem("user"));

    if (!user) {
        window.location.href = "login.html";
        return;
    }

    try {

        const response = await fetch(
            `http://localhost:3000/tasks?user_id=${user.user_id}`
        );

        const tasks = await response.json();

        allTasks = tasks;

        updateDashboard();
        displayTasks(allTasks);

    } catch (error) {

        console.error("Error loading tasks:", error);

    }

}
function displayTasks(tasks) {

    taskList.innerHTML = "";

    if (tasks.length === 0) {
        taskList.innerHTML = `
            <div class="empty-tasks">
                <div class="empty-icon">📭</div>
                <h3>No tasks found</h3>
                <p>Try changing your search or filter.</p>
            </div>
        `;
        return;
    }

    tasks.forEach(task => {

        let statusClass = "";
        let statusIcon = "📝";

        if (task.status === "Completed") {
            statusClass = "status-completed";
            statusIcon = "✅";
        } else if (task.status === "In Progress") {
            statusClass = "status-progress";
            statusIcon = "⏳";
        } else {
            statusClass = "status-pending";
            statusIcon = "📌";
        }

        let priorityClass = "";

        if (task.priority === "High") {
            priorityClass = "priority-high";
        } else if (task.priority === "Medium") {
            priorityClass = "priority-medium";
        } else {
            priorityClass = "priority-low";
        }

        const completedClass =
            task.status === "Completed"
                ? "completed-task"
                : "";

        taskList.innerHTML += `
            <div class="task ${completedClass}">

                <div class="task-top">

                    <div class="task-status-icon">
                        ${statusIcon}
                    </div>

                    <div class="task-title-area">
                        <h3>${task.title}</h3>
                        <span class="task-id">
                            Task #${task.task_id}
                        </span>
                    </div>

                </div>

                <p class="task-description">
                    ${task.description || "No description provided."}
                </p>

                <div class="task-info">

                    <span class="badge ${priorityClass}">
                        ${task.priority} Priority
                    </span>

                    <span class="badge ${statusClass}">
                        ${task.status}
                    </span>

                    <span class="badge category-badge">
                        🏷️ ${task.category_name || "No Category"}
                    </span>

                </div>

                <div class="task-due-date">

                    <span>📅</span>

                    <div>
                        <small>Due Date</small>
                        <strong>
                            ${task.due_date.substring(0, 10)}
                        </strong>
                    </div>

                </div>

                <div class="task-actions">

                    <button
                        class="edit-button"
                        onclick="editTask(${task.task_id})">
                        ✏️ Edit
                    </button>

                    <button
                        class="delete-button"
                        onclick="deleteTask(${task.task_id})">
                        🗑️ Delete
                    </button>

                </div>

            </div>
        `;
    });
}

function applyFilters() {

    let filteredTasks = [...allTasks];

    const searchValue = searchTask.value.toLowerCase().trim();
    const statusValue = statusFilter.value;
    const priorityValue = priorityFilter.value;

    if (searchValue !== "") {
        filteredTasks = filteredTasks.filter(task => {

            const title = String(task.title || "").toLowerCase();
            const description = String(task.description || "").toLowerCase();
            const category = String(task.category_name || "").toLowerCase();

            return (
                title.includes(searchValue) ||
                description.includes(searchValue) ||
                category.includes(searchValue)
            );
        });
    }

    if (statusValue !== "All") {
        filteredTasks = filteredTasks.filter(task =>
            task.status === statusValue
        );
    }

    if (priorityValue !== "All") {
        filteredTasks = filteredTasks.filter(task =>
            task.priority === priorityValue
        );
    }

    const sortValue = sortTasks.value;

    if (sortValue === "dueSoon") {
        filteredTasks.sort((a, b) =>
            new Date(a.due_date) - new Date(b.due_date)
        );
    }

    if (sortValue === "dueLate") {
        filteredTasks.sort((a, b) =>
            new Date(b.due_date) - new Date(a.due_date)
        );
    }

    const priorityOrder = {
        High: 3,
        Medium: 2,
        Low: 1
    };

    if (sortValue === "priorityHigh") {
        filteredTasks.sort((a, b) =>
            priorityOrder[b.priority] - priorityOrder[a.priority]
        );
    }

    if (sortValue === "priorityLow") {
        filteredTasks.sort((a, b) =>
            priorityOrder[a.priority] - priorityOrder[b.priority]
        );
    }

    displayTasks(filteredTasks);
}

function closeDeleteModal() {

    document.getElementById("deleteModal").style.display =
        "none";

    deleteTaskId = null;
}

function deleteTask(id) {

    deleteTaskId = id;

    document.getElementById("deleteModal").style.display =
        "block";
}

async function confirmDelete() {

    if (!deleteTaskId) {
        return;
    }

    try {

        const response =
            await fetch(
                `http://localhost:3000/tasks/${deleteTaskId}`,
                {
                    method: "DELETE"
                }
            );

        const result =
            await response.json();

        alert(result.message);

        closeDeleteModal();

        loadTasks();

    } catch (error) {

        console.error(
            "Error deleting task:",
            error
        );

        alert("Unable to connect to server.");
    }
}

async function editTask(id) {

    try {

        const user = JSON.parse(localStorage.getItem("user"));

        if (!user) {
            window.location.href = "login.html";
            return;
        }

        const response = await fetch(
            `http://localhost:3000/tasks?user_id=${user.user_id}`
        );

        const tasks = await response.json();

        const task = tasks.find(
            t => t.task_id === id
        );

        if (!task) {

            alert("Task not found!");

            return;
        }

        document.getElementById("editTaskId").value =
            task.task_id;

        document.getElementById("editTitle").value =
            task.title;

        document.getElementById("editDescription").value =
            task.description || "";

        document.getElementById("editPriority").value =
            task.priority;

        document.getElementById("editStatus").value =
            task.status;

        document.getElementById("editDueDate").value =
            task.due_date.substring(0, 10);

        if (task.category_id) {

            document.getElementById("editCategory").value =
                task.category_id;
        }

        document.getElementById("editModal").style.display =
            "block";

    } catch (error) {

        console.error(
            "Error opening edit form:",
            error
        );
    }
}

editForm.addEventListener("submit", async function (event) {

    event.preventDefault();

    const id =
        document.getElementById("editTaskId").value;

    const updatedTask = {

        title:
            document.getElementById("editTitle").value,

        description:
            document.getElementById("editDescription").value,

        priority:
            document.getElementById("editPriority").value,

        status:
            document.getElementById("editStatus").value,

        due_date:
            document.getElementById("editDueDate").value,

        category_id:
            document.getElementById("editCategory").value
    };

    try {

        const response = await fetch(
            `http://localhost:3000/tasks/${id}`,
            {
                method: "PUT",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify(updatedTask)
            }
        );

        const result = await response.json();

        alert(result.message);

        closeEditModal();

        loadTasks();

    } catch (error) {

        console.error(
            "Error updating task:",
            error
        );
    }
});

function closeEditModal() {

    document.getElementById("editModal").style.display =
        "none";
}

function filterTasks() {

    const searchValue =
        searchTask.value.toLowerCase();

    const selectedStatus =
        statusFilter.value;

    const filteredTasks =
        allTasks.filter(task => {

            const matchesSearch =
                task.title.toLowerCase().includes(searchValue) ||
                (task.description || "")
                    .toLowerCase()
                    .includes(searchValue) ||
                task.status.toLowerCase().includes(searchValue) ||
                task.priority.toLowerCase().includes(searchValue) ||
                (task.category_name || "")
                    .toLowerCase()
                    .includes(searchValue);

            const matchesStatus =
                selectedStatus === "All" ||
                task.status === selectedStatus;

            return matchesSearch && matchesStatus;
        });

    displayTasks(filteredTasks);
}





function filterDashboard(status) {

    statusFilter.value = status;

    priorityFilter.value = "All";

    sortTasks.value = "default";

    searchTask.value = "";

    if (status === "All") {
        displayTasks(allTasks);
    } else {
        const filteredTasks = allTasks.filter(task =>
            task.status === status
        );

        displayTasks(filteredTasks);
    }

    document.getElementById("myTasks").scrollIntoView({
        behavior: "smooth"
    });
}
const themeToggle = document.getElementById("themeToggle");

themeToggle.addEventListener("click", function () {

    document.body.classList.toggle("dark-mode");

    if (document.body.classList.contains("dark-mode")) {
        themeToggle.textContent = "☀️";
        localStorage.setItem("theme", "dark");
    } else {
        themeToggle.textContent = "🌙";
        localStorage.setItem("theme", "light");
    }
});

if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark-mode");
    themeToggle.textContent = "☀️";
}
function goToSection(sectionId) {

    document.getElementById(sectionId).scrollIntoView({
        behavior: "smooth"
    });

}

const backToTop = document.getElementById("backToTop");

window.addEventListener("scroll", function () {

    if (window.scrollY > 400) {
        backToTop.classList.add("show");
    } else {
        backToTop.classList.remove("show");
    }

});

function scrollToTop() {

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

}
searchTask.addEventListener("input", applyFilters);

statusFilter.addEventListener("change", applyFilters);

priorityFilter.addEventListener("change", applyFilters);

sortTasks.addEventListener("change", applyFilters);

loadCategories();
displayCategories();
loadTasks();
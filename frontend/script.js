const API = "https://task-manager-backend-3nxb.onrender.com";
const $ = id => document.getElementById(id);
const taskForm = $("taskForm"), taskList = $("taskList"), editForm = $("editForm"),
    searchTask = $("searchTask"), statusFilter = $("statusFilter"), priorityFilter = $("priorityFilter"),
    sortTasks = $("sortTasks"), categoryForm = $("categoryForm"), categoryList = $("categoryList");
let allTasks = [], deleteTaskId = null, view = "all";
const user = JSON.parse(localStorage.getItem("user"));
if (!user) location.href = "login.html";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ymd = d => d.toLocaleDateString("en-CA");
const today = () => ymd(new Date());
const dueOf = t => String(t.due_date || "").substring(0, 10);
const store = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const palette = ["#F5E6C8", "#DCEADF", "#DCE6EC", "#F6DDD5", "#E6DCEF", "#EFE9C9"];

let toastTimer;
function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}
async function req(path, method = "GET", body) {
    const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || "Request failed");
    return data;
}

/* ---------- header / greeting / logout ---------- */
const h = new Date().getHours();
$("greeting").textContent = `Good ${h < 12 ? "morning" : h < 18 ? "afternoon" : "evening"}, ${(user?.name || user?.user_name || "there").split(" ")[0]}`;
$("todayDate").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
$("userName").textContent = user?.name || user?.user_name || "";
$("logoutBtn").onclick = () => { localStorage.removeItem("user"); location.href = "login.html"; };

/* ---------- streak + weekly log ---------- */
/* ---------- streak + weekly log ---------- */

async function logDone() {
    try {
        const data = await req("/api/progress/study", "POST", {
            user_id: user.user_id
        });

        $("streakCount").textContent = data.study_streak;

        await loadWeeklyProgress();

    } catch (err) {
        console.error(err);
        toast("Unable to update study streak.");
    }
}

async function renderStreak() {
    try {
        const progress = await req(`/api/progress/${user.user_id}`);

        if (progress.length > 0) {
            $("streakCount").textContent = progress[0].study_streak || 0;
        } else {
            $("streakCount").textContent = 0;
        }

        await loadWeeklyProgress();

    } catch (err) {
        console.error(err);
        $("streakCount").textContent = 0;
    }
}

async function loadWeeklyProgress() {
    try {
        const data = await req(`/api/progress/week/${user.user_id}`);

        const log = {};

        data.forEach(item => {
            const date = String(item.study_date).substring(0, 10);
            log[date] = 1;
        });

        const days = [...Array(7)].map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - 6 + i);
            return d;
        });

        $("weekChart").innerHTML = days.map(d => {
            const date = ymd(d);
            const studied = log[date];

            return `
                <div title="${studied ? "Study completed" : "No study"}">
                    <i style="height:${studied ? 70 : 10}%"></i>
                    ${d.toLocaleDateString(undefined, {
                        weekday: "narrow"
                    })}
                </div>
            `;
        }).join("");

    } catch (err) {
        console.error(err);
    }
}
/* ---------- exam countdown ---------- */
/* ---------- exam countdown ---------- */

async function renderExam() {
    try {
        const progress = await req(`/api/progress/${user.user_id}`);

        if (!progress.length) {
            $("examDays").textContent = "--";
            $("examLabel").textContent = "Set your next exam";
            $("examName").value = "";
            $("examDate").value = "";
            return;
        }

        const exam = progress[0];
        const examDate = String(exam.exam_date).substring(0, 10);

        const days = Math.ceil(
            (new Date(examDate) - new Date(today())) / 864e5
        );

        $("examDays").textContent = days >= 0 ? days : "Done";

        $("examLabel").textContent =
            days >= 0
                ? `days until ${exam.exam_name}`
                : `${exam.exam_name} has passed`;

        $("examName").value = exam.exam_name;
        $("examDate").value = examDate;

    } catch (err) {
        console.error(err);
    }
}


$("examSave").onclick = async () => {
    const name = $("examName").value.trim();
    const date = $("examDate").value;

    if (!name) {
        return toast("Enter exam name");
    }

    if (!date) {
        return toast("Pick an exam date");
    }

    try {
        await req("/api/progress", "POST", {
            user_id: user.user_id,
            exam_name: name,
            exam_date: date
        });

        await renderExam();

        toast("Exam saved successfully!");

    } catch (err) {
        console.error(err);
        toast(err.message);
    }
};
/* ---------- pomodoro ---------- */
/* ---------- focus timer ---------- */

let pomo = {
    left: 25 * 60,
    id: null,
    mode: 25
};

const savedFocusTime = Number(localStorage.getItem("focusTime"));
const savedBreakTime = Number(localStorage.getItem("breakTime"));

const focusTime = savedFocusTime > 0 ? savedFocusTime : 25;
const breakTime = savedBreakTime > 0 ? savedBreakTime : 5;

pomo.mode = focusTime;
pomo.left = focusTime * 60;

const showTimer = () => {
    $("timerView").textContent =
        `${String(Math.floor(pomo.left / 60)).padStart(2, "0")}:${String(pomo.left % 60).padStart(2, "0")}`;
};

$("timerStart").onclick = () => {

    if (pomo.id) {
        clearInterval(pomo.id);
        pomo.id = null;
        $("timerStart").textContent = "Start";
        return;
    }

    $("timerStart").textContent = "Pause";

    pomo.id = setInterval(() => {

        pomo.left--;

        if (pomo.left <= 0) {

            clearInterval(pomo.id);
            pomo.id = null;
            pomo.left = 0;

            $("timerStart").textContent = "Start";

            if (pomo.mode === focusTime) {
                toast("Focus done. Take a break!");
            } else {
                toast("Break over. Back to work!");
            }
        }

        showTimer();

    }, 1000);
};

$("timerMode").onclick = () => {

    pomo.mode = pomo.mode === focusTime ? breakTime : focusTime;

    $("timerMode").textContent =
        pomo.mode === focusTime ? "Break" : "Focus";

    $("timerReset").click();
};

$("timerReset").onclick = () => {

    clearInterval(pomo.id);
    pomo.id = null;

    pomo.left = pomo.mode * 60;

    $("timerStart").textContent = "Start";

    showTimer();
};

showTimer();

// Timer customization

$("timerSettingsBtn").onclick = () => {
    const settings = $("timerSettings");

    settings.style.display =
        settings.style.display === "none" ? "block" : "none";

    $("focusInput").value =
        Number(localStorage.getItem("focusTime")) || 25;

    $("breakInput").value =
        Number(localStorage.getItem("breakTime")) || 5;
};

$("saveTimerSettings").onclick = () => {

    const newFocus = Number($("focusInput").value);
    const newBreak = Number($("breakInput").value);

    if (newFocus < 1 || newFocus > 180) {
        toast("Focus time must be between 1 and 180 minutes.");
        return;
    }

    if (newBreak < 1 || newBreak > 60) {
        toast("Break time must be between 1 and 60 minutes.");
        return;
    }

    localStorage.setItem("focusTime", newFocus);
    localStorage.setItem("breakTime", newBreak);

    pomo.mode = newFocus;
    pomo.left = newFocus * 60;

    $("timerMode").textContent = "Break";

    clearInterval(pomo.id);
    pomo.id = null;

    $("timerStart").textContent = "Start";

    showTimer();

    $("timerSettings").style.display = "none";

    toast("Timer settings saved!");
};

/* ---------- modals ---------- */
const openAdd = () => $("addModal").style.display = "block";
const closeAdd = () => $("addModal").style.display = "none";
const closeEditModal = () => $("editModal").style.display = "none";
const closeDeleteModal = () => { $("deleteModal").style.display = "none"; deleteTaskId = null; };
window.addEventListener("click", e => { if (e.target.classList.contains("modal")) e.target.style.display = "none"; });

/* ---------- categories ---------- */
async function loadCategories() {
    try {
        const cats = await req("/categories");
        const opts = cats.map(c => `<option value="${c.category_id}">${esc(c.category_name)}</option>`).join("");
        $("category").innerHTML = opts; $("editCategory").innerHTML = opts;
        categoryList.innerHTML = cats.map(c => `<div class="category-item" style="background:${palette[c.category_id % palette.length]};color:#1F2430">
            <span>${esc(c.category_name)}</span><button onclick="deleteCategory(${c.category_id})" aria-label="Delete category">✕</button></div>`).join("");
    } catch (e) { console.error(e); }
}
categoryForm.addEventListener("submit", async e => {
    e.preventDefault();
    try { await req("/categories", "POST", { category_name: $("categoryName").value }); categoryForm.reset(); toast("Category added"); loadCategories(); }
    catch (err) { toast(err.message); }
});
async function deleteCategory(id) {
    try { await req(`/categories/${id}`, "DELETE"); toast("Category deleted"); loadCategories(); loadTasks(); }
    catch (err) { toast(err.message); }
}

/* ---------- dashboard ---------- */
function updateDashboard() {
    const n = s => allTasks.filter(t => t.status === s).length, total = allTasks.length, done = n("Completed");
    $("totalTasks").textContent = total; $("completedTasks").textContent = done;
    $("progressTasks").textContent = n("In Progress"); $("pendingTasks").textContent = n("Pending");
    const pct = total ? Math.round(done / total * 100) : 0;
    $("progressPercentage").textContent = pct + "%"; $("progressFill").style.width = pct + "%";
    $("progressText").textContent = `${done} of ${total} tasks completed`;
    $("ringPct").textContent = pct + "%"; $("ring").style.setProperty("--p", pct);
}

/* ---------- tasks ---------- */
function duePill(t) {
    const d = dueOf(t); if (!d) return "";
    const diff = Math.round((new Date(d) - new Date(today())) / 864e5), done = t.status === "Completed";
    if (done) return `<span class="due">📅 ${d}</span>`;
    if (diff < 0) return `<span class="due late">Overdue by ${-diff} day${diff === -1 ? "" : "s"}</span>`;
    if (diff === 0) return `<span class="due soon">Due today</span>`;
    return `<span class="due ${diff <= 2 ? "soon" : ""}">Due in ${diff} day${diff === 1 ? "" : "s"}</span>`;
}
function displayTasks(tasks) {
    if (!tasks.length) {
        taskList.innerHTML = `<div class="empty-tasks"><h3>Nothing here yet</h3><p>Add a task or change your filters.</p></div>`; return;
    }
    taskList.innerHTML = tasks.map(t => {
        const sc = t.status === "Completed" ? "status-completed" : t.status === "In Progress" ? "status-progress" : "status-pending";
        const pc = { High: "priority-high", Medium: "priority-medium" }[t.priority] || "priority-low";
        return `<div class="task p-${esc(t.priority)} ${t.status === "Completed" ? "completed-task" : ""}">
          <div class="task-top">
            <button class="check" onclick="toggleDone(${t.task_id})" aria-label="Mark complete">${t.status === "Completed" ? "✓" : ""}</button>
            <div><h3>${esc(t.title)}</h3><span class="task-id">Task #${t.task_id}</span></div>
          </div>
          <p class="task-description">${esc(t.description) || "No description provided."}</p>
          <div class="task-info">
            <span class="badge ${pc}">${esc(t.priority)} priority</span><span class="badge ${sc}">${esc(t.status)}</span>
            <span class="badge category-badge">${esc(t.category_name) || "No category"}</span>
          </div>
          ${duePill(t)}
          <div class="task-actions"><button class="btn gold-btn" onclick="editTask(${t.task_id})">Edit</button>
          <button class="btn ghost" onclick="deleteTask(${t.task_id})">Delete</button></div></div>`;
    }).join("");
}
function applyFilters() {
    let f = [...allTasks]; const q = searchTask.value.toLowerCase().trim(), t0 = today();
    if (q) f = f.filter(t => [t.title, t.description, t.category_name].some(v => String(v || "").toLowerCase().includes(q)));
    if (statusFilter.value !== "All") f = f.filter(t => t.status === statusFilter.value);
    if (priorityFilter.value !== "All") f = f.filter(t => t.priority === priorityFilter.value);
    const open = t => t.status !== "Completed";
    if (view === "today") f = f.filter(t => open(t) && dueOf(t) === t0);
    if (view === "upcoming") f = f.filter(t => open(t) && dueOf(t) > t0);
    if (view === "overdue") f = f.filter(t => open(t) && dueOf(t) < t0);
    const rank = { High: 3, Medium: 2, Low: 1 }, s = sortTasks.value;
    if (s === "dueSoon") f.sort((a, b) => dueOf(a).localeCompare(dueOf(b)));
    if (s === "dueLate") f.sort((a, b) => dueOf(b).localeCompare(dueOf(a)));
    if (s === "priorityHigh") f.sort((a, b) => rank[b.priority] - rank[a.priority]);
    if (s === "priorityLow") f.sort((a, b) => rank[a.priority] - rank[b.priority]);
    displayTasks(f);
}
async function loadTasks(first) {
    if (first) taskList.innerHTML = '<div class="skeleton"></div>'.repeat(4);
    try { allTasks = await req(`/tasks?user_id=${user.user_id}`); updateDashboard(); applyFilters(); }
    catch (e) { console.error(e); toast("Unable to connect to server."); }
}
taskForm.addEventListener("submit", async e => {
    e.preventDefault();
    const body = {
        project_id: 1, title: $("title").value, description: $("description").value, priority: $("priority").value,
        status: $("status").value, due_date: $("due_date").value, category_id: $("category").value, user_id: user.user_id
    };
    try {
        await req("/tasks", "POST", body); if (body.status === "Completed") logDone();
        taskForm.reset(); $("priority").value = "Medium"; $("status").value = "Pending";
        closeAdd(); toast("Task added"); loadTasks();
    } catch (err) { toast(err.message); }
});
async function saveTask(t, changes) {
    const body = {
        title: t.title, description: t.description, priority: t.priority, status: t.status,
        due_date: dueOf(t), category_id: t.category_id, ...changes
    };
    await req(`/tasks/${t.task_id}`, "PUT", body);
    if (changes.status === "Completed" && t.status !== "Completed") logDone();
}
async function toggleDone(id) {
    const t = allTasks.find(x => x.task_id === id); if (!t) return;
    const status = t.status === "Completed" ? "Pending" : "Completed";
    try { await saveTask(t, { status }); toast(status === "Completed" ? "Task completed" : "Task reopened"); loadTasks(); }
    catch (err) { toast(err.message); }
}
function editTask(id) {
    const t = allTasks.find(x => x.task_id === id); if (!t) return toast("Task not found");
    $("editTaskId").value = t.task_id; $("editTitle").value = t.title; $("editDescription").value = t.description || "";
    $("editPriority").value = t.priority; $("editStatus").value = t.status; $("editDueDate").value = dueOf(t);
    if (t.category_id) $("editCategory").value = t.category_id;
    $("editModal").style.display = "block";
}
editForm.addEventListener("submit", async e => {
    e.preventDefault();
    const t = allTasks.find(x => x.task_id == $("editTaskId").value);
    try {
        await saveTask(t, {
            title: $("editTitle").value, description: $("editDescription").value, priority: $("editPriority").value,
            status: $("editStatus").value, due_date: $("editDueDate").value, category_id: $("editCategory").value
        });
        closeEditModal(); toast("Changes saved"); loadTasks();
    } catch (err) { toast(err.message); }
});
const deleteTask = id => { deleteTaskId = id; $("deleteModal").style.display = "block"; };
async function confirmDelete() {
    if (!deleteTaskId) return;
    try { await req(`/tasks/${deleteTaskId}`, "DELETE"); closeDeleteModal(); toast("Task deleted"); loadTasks(); }
    catch (err) { toast(err.message); }
}
function setView(v) {
    view = v; document.querySelectorAll(".tab").forEach(b => b.classList.toggle("on", b.dataset.view === v)); applyFilters();
}
function filterDashboard(status) {
    statusFilter.value = status; priorityFilter.value = "All"; sortTasks.value = "default"; searchTask.value = "";
    setView("all"); $("myTasks").scrollIntoView({ behavior: "smooth" });
}

/* ---------- theme, scroll, wiring ---------- */
const themeToggle = $("themeToggle");
function setTheme(dark) { document.body.classList.toggle("dark-mode", dark); themeToggle.textContent = dark ? "☀️" : "🌙"; localStorage.setItem("theme", dark ? "dark" : "light"); }
themeToggle.onclick = () => setTheme(!document.body.classList.contains("dark-mode"));
if (localStorage.getItem("theme") === "dark") setTheme(true);
window.addEventListener("scroll", () => $("backToTop").classList.toggle("show", scrollY > 400));
const scrollToTop = () => scrollTo({ top: 0, behavior: "smooth" });
document.querySelectorAll(".tab").forEach(b => b.onclick = () => setView(b.dataset.view));
[searchTask].forEach(el => el.addEventListener("input", applyFilters));
[statusFilter, priorityFilter, sortTasks].forEach(el => el.addEventListener("change", applyFilters));

renderStreak();
renderExam();
showTimer();
loadCategories();
loadTasks(true);
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
function logDone() {
    const log = store("tm_done", {}), t = today();
    log[t] = (log[t] || 0) + 1; localStorage.setItem("tm_done", JSON.stringify(log));
    const s = store("tm_streak", { last: "", count: 0 });
    if (s.last !== t) {
        const y = new Date(); y.setDate(y.getDate() - 1);
        s.count = s.last === ymd(y) ? s.count + 1 : 1; s.last = t;
        localStorage.setItem("tm_streak", JSON.stringify(s));
    }
    renderStreak();
}
function renderStreak() {
    const s = store("tm_streak", { last: "", count: 0 }), y = new Date(); y.setDate(y.getDate() - 1);
    $("streakCount").textContent = (s.last === today() || s.last === ymd(y)) ? s.count : 0;
    const log = store("tm_done", {}), days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return d; });
    const max = Math.max(1, ...days.map(d => log[ymd(d)] || 0));
    $("weekChart").innerHTML = days.map(d => {
        const n = log[ymd(d)] || 0;
        return `<div title="${n} done"><i style="height:${n / max * 70}%"></i>${d.toLocaleDateString(undefined, { weekday: "narrow" })}</div>`;
    }).join("");
}

/* ---------- exam countdown ---------- */
function renderExam() {
    const e = store("tm_exam", null); if (!e) return;
    const days = Math.ceil((new Date(e.date) - new Date(today())) / 864e5);
    $("examDays").textContent = days >= 0 ? days : "Done";
    $("examLabel").textContent = days >= 0 ? `days until ${e.name}` : `${e.name} has passed`;
    $("examName").value = e.name; $("examDate").value = e.date;
}
$("examSave").onclick = () => {
    if (!$("examDate").value) return toast("Pick an exam date");
    localStorage.setItem("tm_exam", JSON.stringify({ name: $("examName").value || "Exam", date: $("examDate").value }));
    renderExam(); toast("Exam saved");
};

/* ---------- pomodoro ---------- */
let pomo = { mode: 25, left: 1500, id: null };
const showTimer = () => $("timerView").textContent = `${String(Math.floor(pomo.left / 60)).padStart(2, "0")}:${String(pomo.left % 60).padStart(2, "0")}`;
$("timerStart").onclick = () => {
    if (pomo.id) { clearInterval(pomo.id); pomo.id = null; $("timerStart").textContent = "Start"; return; }
    $("timerStart").textContent = "Pause";
    pomo.id = setInterval(() => {
        if (--pomo.left <= 0) { clearInterval(pomo.id); pomo.id = null; pomo.left = 0; $("timerStart").textContent = "Start"; toast(pomo.mode === 25 ? "Focus done. Take a break!" : "Break over. Back to work!"); }
        showTimer();
    }, 1000);
};
$("timerMode").onclick = () => { pomo.mode = pomo.mode === 25 ? 5 : 25; $("timerMode").textContent = pomo.mode === 25 ? "Break" : "Focus"; $("timerReset").click(); };
$("timerReset").onclick = () => { clearInterval(pomo.id); pomo.id = null; pomo.left = pomo.mode * 60; $("timerStart").textContent = "Start"; showTimer(); };

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

renderStreak(); renderExam(); showTimer(); loadCategories(); loadTasks(true);
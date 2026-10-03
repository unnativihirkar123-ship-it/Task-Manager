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
const timeOf = t => String(t.due_time || "").substring(0, 5);   // "HH:MM" or ""
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
async function logDone() {
    try {
        const data = await req("/api/progress/study", "POST", { user_id: user.user_id });
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
        $("streakCount").textContent = progress.length > 0 ? (progress[0].study_streak || 0) : 0;
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
        data.forEach(item => { log[String(item.study_date).substring(0, 10)] = 1; });

        const days = [...Array(7)].map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - 6 + i);
            return d;
        });

        $("weekChart").innerHTML = days.map(d => {
            const studied = log[ymd(d)];
            return `<div title="${studied ? "Study completed" : "No study"}">
                <i style="height:${studied ? 70 : 10}%"></i>
                ${d.toLocaleDateString(undefined, { weekday: "narrow" })}
            </div>`;
        }).join("");
    } catch (err) {
        console.error(err);
    }
}

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
        const days = Math.ceil((new Date(examDate) - new Date(today())) / 864e5);

        $("examDays").textContent = days >= 0 ? days : "Done";
        $("examLabel").textContent = days >= 0 ? `days until ${exam.exam_name}` : `${exam.exam_name} has passed`;
        $("examName").value = exam.exam_name;
        $("examDate").value = examDate;
    } catch (err) {
        console.error(err);
    }
}

$("examSave").onclick = async () => {
    const name = $("examName").value.trim();
    const date = $("examDate").value;

    if (!name) return toast("Enter exam name");
    if (!date) return toast("Pick an exam date");

    try {
        await req("/api/progress", "POST", { user_id: user.user_id, exam_name: name, exam_date: date });
        await renderExam();
        toast("Exam saved successfully!");
    } catch (err) {
        console.error(err);
        toast(err.message);
    }
};

/* =========================================================
   FOCUS TIMER  (+ Picture-in-Picture)
   NOTE: every timer element is grabbed once into T. When the
   card is moved into the PiP window, document.getElementById
   can no longer find it, but these references keep working.
   ========================================================= */
const T = {
    card: $("timerCard"), view: $("timerView"),
    start: $("timerStart"), mode: $("timerMode"), reset: $("timerReset"),
    settings: $("timerSettings"), settingsBtn: $("timerSettingsBtn"),
    focusInput: $("focusInput"), breakInput: $("breakInput"), save: $("saveTimerSettings"),
    pipBtn: $("pipBtn")
};

let focusTime = Number(localStorage.getItem("focusTime")) || 25;
let breakTime = Number(localStorage.getItem("breakTime")) || 5;
const pomo = { left: focusTime * 60, id: null, mode: "focus", endAt: 0 };

const pad = n => String(n).padStart(2, "0");
const showTimer = () => { T.view.textContent = `${pad(Math.floor(pomo.left / 60))}:${pad(pomo.left % 60)}`; };

function beep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.frequency.value = 880; gain.gain.value = 0.15;
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.35);
    } catch { /* sound is optional */ }
}

function stopTimer() {
    clearInterval(pomo.id);
    pomo.id = null;
    T.start.textContent = "Start";
}

/* time is measured from an end timestamp, so it stays correct even
   when the browser slows down timers in background tabs */
function tick() {
    pomo.left = Math.max(0, Math.ceil((pomo.endAt - Date.now()) / 1000));
    showTimer();
    if (pomo.left > 0) return;

    stopTimer();
    const wasFocus = pomo.mode === "focus";
    toast(wasFocus ? "Focus done. Take a break!" : "Break over. Back to work!");
    beep();
    pomo.mode = wasFocus ? "break" : "focus";
    pomo.left = (wasFocus ? breakTime : focusTime) * 60;
    T.mode.textContent = pomo.mode === "focus" ? "Break" : "Focus";
    showTimer();
}

T.start.onclick = () => {
    if (pomo.id) {            // pause
        tick();
        stopTimer();
        return;
    }
    pomo.endAt = Date.now() + pomo.left * 1000;
    T.start.textContent = "Pause";
    pomo.id = setInterval(tick, 250);
};

T.reset.onclick = () => {
    stopTimer();
    pomo.left = (pomo.mode === "focus" ? focusTime : breakTime) * 60;
    showTimer();
};

T.mode.onclick = () => {
    pomo.mode = pomo.mode === "focus" ? "break" : "focus";
    T.mode.textContent = pomo.mode === "focus" ? "Break" : "Focus";
    T.reset.click();
};

T.settingsBtn.onclick = () => {
    T.settings.style.display = T.settings.style.display === "none" ? "block" : "none";
    T.focusInput.value = focusTime;
    T.breakInput.value = breakTime;
};

T.save.onclick = () => {
    const newFocus = Number(T.focusInput.value);
    const newBreak = Number(T.breakInput.value);

    if (!newFocus || newFocus < 1 || newFocus > 180) return toast("Focus time must be between 1 and 180 minutes.");
    if (!newBreak || newBreak < 1 || newBreak > 60) return toast("Break time must be between 1 and 60 minutes.");

    focusTime = newFocus;
    breakTime = newBreak;
    localStorage.setItem("focusTime", focusTime);
    localStorage.setItem("breakTime", breakTime);

    stopTimer();
    pomo.mode = "focus";
    pomo.left = focusTime * 60;
    T.mode.textContent = "Break";
    showTimer();
    T.settings.style.display = "none";
    toast("Timer settings saved!");
};

showTimer();

/* ---------- Picture-in-Picture ---------- */
let pipWin = null, pipVideo = null, pipDrawId = null;
const timerHome = T.card.parentElement;

T.pipBtn.onclick = async () => {
    if (pipWin) return pipWin.close();
    if (pipVideo) return document.exitPictureInPicture().catch(() => { });

    try {
        if ("documentPictureInPicture" in window) await openDocPiP();   // Chrome / Edge 116+
        else if (document.pictureInPictureEnabled) await openVideoPiP(); // fallback: time only
        else toast("Your browser doesn't support Picture-in-Picture.");
    } catch (err) {
        console.error(err);
        toast("Couldn't open the floating timer.");
    }
};

/* Best option: the real timer card (with working buttons) floats on top of every window */
async function openDocPiP() {
    pipWin = await documentPictureInPicture.requestWindow({ width: 320, height: 240 });

    document.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
        const link = pipWin.document.createElement("link");
        link.rel = "stylesheet";
        link.href = l.href;
        pipWin.document.head.appendChild(link);
    });
    pipWin.document.title = "Focus timer";
    pipWin.document.body.className = document.body.className + " pip-body";

    // leave a placeholder where the card was
    const placeholder = document.createElement("div");
    placeholder.className = "card";
    placeholder.innerHTML = `<h3>Focus timer</h3>
        <p class="muted">Floating in its own window.</p>
        <button class="btn ghost" type="button">Bring it back</button>`;
    placeholder.querySelector("button").onclick = () => pipWin && pipWin.close();
    T.card.before(placeholder);
    pipWin.document.body.append(T.card);

    pipWin.addEventListener("pagehide", () => {
        placeholder.replaceWith(T.card);
        pipWin = null;
    });
}

/* Fallback (Firefox, Safari): draw the time on a canvas and pop it out as a small video */
async function openVideoPiP() {
    const c = document.createElement("canvas");
    c.width = 320; c.height = 180;
    const ctx = c.getContext("2d");

    const draw = () => {
        ctx.fillStyle = "#1D2128";
        ctx.fillRect(0, 0, 320, 180);
        ctx.textAlign = "center";
        ctx.fillStyle = "#E0A542";
        ctx.font = "700 64px Georgia, serif";
        ctx.fillText(T.view.textContent, 160, 100);
        ctx.fillStyle = "#ECE6D9";
        ctx.font = "600 16px sans-serif";
        ctx.fillText(pomo.mode === "focus" ? "Focus" : "Break", 160, 140);
    };
    draw();

    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.srcObject = c.captureStream(4);
    v.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.append(v);

    pipDrawId = setInterval(draw, 500);
    pipVideo = v;
    v.addEventListener("leavepictureinpicture", () => {
        clearInterval(pipDrawId);
        v.remove();
        pipVideo = null;
    });

    try {
        await v.play();
        await v.requestPictureInPicture();
    } catch (err) {
        clearInterval(pipDrawId);
        v.remove();
        pipVideo = null;
        throw err;
    }
}

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

/* ---------- deadline timeline ---------- */
const NO_DATE = 8.64e15;
// deadline moment; a task without a time is due at the end of its day
const deadlineMs = t => dueOf(t) ? new Date(`${dueOf(t)}T${timeOf(t) || "23:59"}:00`).getTime() : NO_DATE;

function span(ms) {
    const m = Math.floor(ms / 6e4), d = Math.floor(m / 1440), hh = Math.floor((m % 1440) / 60), mm = m % 60;
    return d ? `${d}d ${hh}h` : hh ? `${hh}h ${mm}m` : `${mm}m`;
}

function timeline(t) {
    const d = dueOf(t); if (!d) return "";
    const when = new Date(`${d}T${timeOf(t) || "00:00"}:00`);
    let dateTxt = when.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    if (timeOf(t)) dateTxt += ", " + when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

    const est = Number(t.est_hours) || 0;
    let out = `<span class="chip">📅 ${dateTxt}</span>`;
    if (est) out += `<span class="chip">⏱ ${est}h needed</span>`;
    if (t.status === "Completed") return out;

    const ms = deadlineMs(t) - Date.now();
    if (ms < 0) return out + `<span class="due late">Overdue by ${span(-ms)}</span>`;

    const tight = est && ms < est * 36e5;      // less time left than work needed
    const cls = tight ? "late" : ms < 2 * 864e5 ? "soon" : "";
    return out + `<span class="due ${cls}">${span(ms)} left${tight ? " · tight deadline" : ""}</span>`;
}

/* ---------- tasks ---------- */
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
          <div class="timeline">${timeline(t)}</div>
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

    // default: nearest deadline first, finished tasks sink to the bottom
    const rank = { High: 3, Medium: 2, Low: 1 }, s = sortTasks.value;
    const openFirst = (a, b) => (a.status === "Completed") - (b.status === "Completed");
    if (s === "dueSoon") f.sort((a, b) => openFirst(a, b) || deadlineMs(a) - deadlineMs(b));
    if (s === "dueLate") f.sort((a, b) => openFirst(a, b) || deadlineMs(b) - deadlineMs(a));
    if (s === "priorityHigh") f.sort((a, b) => rank[b.priority] - rank[a.priority] || deadlineMs(a) - deadlineMs(b));
    if (s === "priorityLow") f.sort((a, b) => rank[a.priority] - rank[b.priority] || deadlineMs(a) - deadlineMs(b));
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
        status: $("status").value, due_date: $("due_date").value, due_time: $("due_time").value || null,
        est_hours: $("est_hours").value || null, category_id: $("category").value, user_id: user.user_id
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
        due_date: dueOf(t), due_time: t.due_time || null, est_hours: t.est_hours ?? null,
        category_id: t.category_id, ...changes
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
    $("editDueTime").value = timeOf(t); $("editHours").value = t.est_hours ?? "";
    if (t.category_id) $("editCategory").value = t.category_id;
    $("editModal").style.display = "block";
}
editForm.addEventListener("submit", async e => {
    e.preventDefault();
    const t = allTasks.find(x => x.task_id == $("editTaskId").value);
    try {
        await saveTask(t, {
            title: $("editTitle").value, description: $("editDescription").value, priority: $("editPriority").value,
            status: $("editStatus").value, due_date: $("editDueDate").value, due_time: $("editDueTime").value || null,
            est_hours: $("editHours").value || null, category_id: $("editCategory").value
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
    statusFilter.value = status; priorityFilter.value = "All"; sortTasks.value = "dueSoon"; searchTask.value = "";
    setView("all"); $("myTasks").scrollIntoView({ behavior: "smooth" });
}

/* ---------- theme, scroll, wiring ---------- */
const themeToggle = $("themeToggle");
function setTheme(dark) {
    document.body.classList.toggle("dark-mode", dark);
    if (pipWin) pipWin.document.body.classList.toggle("dark-mode", dark);
    themeToggle.textContent = dark ? "☀️" : "🌙";
    localStorage.setItem("theme", dark ? "dark" : "light");
}
themeToggle.onclick = () => setTheme(!document.body.classList.contains("dark-mode"));
if (localStorage.getItem("theme") === "dark") setTheme(true);
window.addEventListener("scroll", () => $("backToTop").classList.toggle("show", scrollY > 400));
const scrollToTop = () => scrollTo({ top: 0, behavior: "smooth" });
document.querySelectorAll(".tab").forEach(b => b.onclick = () => setView(b.dataset.view));
[searchTask].forEach(el => el.addEventListener("input", applyFilters));
[statusFilter, priorityFilter, sortTasks].forEach(el => el.addEventListener("change", applyFilters));

// keep "x hours left" fresh without a reload
setInterval(() => { if (allTasks.length) applyFilters(); }, 60000);

renderStreak();
renderExam();
loadCategories();
loadTasks(true);
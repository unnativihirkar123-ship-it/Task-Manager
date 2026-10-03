/* Stintlist mini calendar
   Load AFTER script.js:  <script src="calendar.js"></script>
   It only reads allTasks, deadlines and the helpers from script.js. */
(() => {
    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const KINDS = ["urgent", "task", "done", "event"];   // dot order
    let view = new Date(); view.setDate(1);
    let selected = null;                                  // "YYYY-MM-DD" or null

    const grid = $("calGrid"), side = $("calSide");
    const dateOnly = d => new Date(`${d}T00:00:00`);

    /* every task and major deadline, grouped by its date */
    function byDate() {
        const map = {}, t0 = today();
        const add = (d, it) => { if (d) (map[d] = map[d] || []).push(it); };

        allTasks.forEach(t => {
            const d = dueOf(t), done = t.status === "Completed";
            // red = open task that is overdue or High priority
            const kind = done ? "done" : (d < t0 || t.priority === "High") ? "urgent" : "task";
            add(d, {
                kind, d, title: t.title, ms: deadlineMs(t),
                tag: done ? "Done" : t.priority,
                tagClass: done ? "status-completed" : ({ High: "priority-high", Medium: "priority-medium" }[t.priority] || "priority-low")
            });
        });

        deadlines.forEach(x => {
            const d = dlDate(x), type = TYPE_ICON[x.deadline_type] ? x.deadline_type : "Other";
            add(d, { kind: "event", d, title: x.title, ms: new Date(`${d}T23:59:00`).getTime(), tag: type, tagClass: `type-${type}` });
        });
        return map;
    }

    function timeLeft(it) {
        if (it.kind === "done") return { txt: "Completed", late: false };
        const ms = it.ms - Date.now();
        if (ms < 0) return it.kind === "event" ? { txt: "Passed", late: true } : { txt: `Overdue ${span(-ms)}`, late: true };
        return { txt: `${span(ms)} left`, late: false };
    }

    function row(it) {
        const d = dateOnly(it.d), tl = timeLeft(it);
        return `<div class="cal-item">
            <div class="cal-date"><small>${d.toLocaleDateString(undefined, { month: "short" }).toUpperCase()}</small><b>${d.getDate()}</b></div>
            <div class="cal-title">${esc(it.title)}</div>
            <span class="badge ${it.tagClass}">${esc(it.tag)}</span>
            <span class="cal-time${tl.late ? " cal-late" : ""}">${tl.txt}</span>
        </div>`;
    }

    function render() {
        const map = byDate(), t0 = today();
        const y = view.getFullYear(), m = view.getMonth();
        const first = (new Date(y, m, 1).getDay() + 6) % 7;          // week starts on Monday
        const total = Math.ceil((first + new Date(y, m + 1, 0).getDate()) / 7) * 7;

        $("calMonth").textContent = `${MONTHS[m]} ${y}`;

        let html = "";
        for (let i = 0; i < total; i++) {
            const d = new Date(y, m, 1 - first + i), iso = ymd(d), items = map[iso] || [];
            const kinds = KINDS.filter(k => items.some(it => it.kind === k));
            const label = d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
                + (items.length ? `, ${items.length} item${items.length > 1 ? "s" : ""}` : "");
            html += `<button type="button" class="cal-day${d.getMonth() !== m ? " out" : ""}${iso === t0 ? " today" : ""}${iso === selected ? " sel" : ""}" data-date="${iso}" aria-label="${label}">
                ${d.getDate()}<span class="cal-dots">${kinds.map(k => `<i class="dot-${k}"></i>`).join("")}</span></button>`;
        }
        grid.innerHTML = html;

        // right side: the picked day, or the next 3 things coming up
        let list, title;
        if (selected) {
            title = dateOnly(selected).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
            list = [...(map[selected] || [])].sort((a, b) => (a.kind === "done") - (b.kind === "done") || a.ms - b.ms);
        } else {
            title = "Upcoming";
            list = Object.values(map).flat()
                .filter(it => it.kind !== "done" && (it.kind !== "event" || it.d >= t0))
                .sort((a, b) => a.ms - b.ms).slice(0, 3);
        }
        $("calSideTitle").textContent = title;
        side.innerHTML = list.length
            ? list.map(row).join("")
            : `<div class="cal-empty">${selected ? "Nothing due on this day." : "Nothing coming up. Add a task to see it here."}</div>`;
    }

    grid.addEventListener("click", e => {
        const b = e.target.closest("[data-date]"); if (!b) return;
        const iso = b.dataset.date, d = dateOnly(iso);
        selected = selected === iso ? null : iso;
        if (d.getMonth() !== view.getMonth()) view = new Date(d.getFullYear(), d.getMonth(), 1);
        render();
    });
    $("calPrev").onclick = () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); };
    $("calNext").onclick = () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); };
    $("calToday").onclick = () => { view = new Date(); view.setDate(1); selected = null; render(); };

    window.renderCalendar = render;       // script.js calls this after tasks load
    setInterval(render, 60000);           // keep "left" times fresh
    render();
})();
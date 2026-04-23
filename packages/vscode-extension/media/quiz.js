const vscode = acquireVsCodeApi();

/**
 * ════════════════════════════════════════
 * SECURITY & UTILS
 * ════════════════════════════════════════
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

document.addEventListener('DOMContentLoaded', () => {
    // Data is injected via window.__QUIZGATE_DATA__ by quiz-panel.ts
    const data = window.__QUIZGATE_DATA__;
    if (!data) return;

    const timeoutAttr = document.body.getAttribute('data-timeout');
    const totalTime = timeoutAttr ? parseInt(timeoutAttr, 10) : 120;
    let timeLeft = totalTime;
    let quizSubmitted = false;

    // answers[qid] = { selected: string }
    const answers = {};
    const questionsCount = data.questions.length;
    let activeIndex = 0;

    // DOM Elements
    const container = document.getElementById('questions-container');
    const currentQEl = document.getElementById('current-q');
    const totalQEl = document.getElementById('total-q');
    const timerLabel = document.getElementById('timer-label');

    // Bottom Controls
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const submitBtn = document.getElementById('submit-btn');
    const quitBtn = document.getElementById('quit-btn');

    totalQEl.textContent = questionsCount;

    /**
     * ════════════════════════════════════════
     * RENDER QUESTIONS
     * Each question gets a freeform textarea for the user's answer.
     * ════════════════════════════════════════
     */
    container.innerHTML = '';
    data.questions.forEach((q, index) => {
        const section = document.createElement('section');
        section.className = 'question-section';
        section.id = `q-card-${index}`;
        section.dataset.index = index;

        let html = `
            <div class="recommendation-box">
                <span class="recommendation-text">${escapeHtml(q.context || "Select the best option or type your own answer")}</span>
            </div>
            <h1 class="question-title">${escapeHtml(q.question)}</h1>
            <div class="options-grid">
        `;

        q.options.forEach((opt) => {
            const hasDesc = !!opt.description;
            html += `
                <div class="option-wrapper">
                    <div class="option-item" data-qid="${escapeAttr(q.id)}" data-val="${escapeAttr(opt.label)}">
                        <div class="option-main-content">
                            <span class="option-text">${escapeHtml(opt.label)}</span>
                            ${hasDesc ? `
                                <button class="info-toggle active" title="Toggle details" aria-label="Toggle description">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="6 9 12 15 18 9"></polyline>
                                    </svg>
                                </button>
                            ` : ''}
                        </div>
                        <svg class="checkmark-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                    ${hasDesc ? `<div class="option-description">${escapeHtml(opt.description)}</div>` : ''}
                </div>
            `;
        });

        // Freeform textarea — always visible, pre-fills when user selects an option
        html += `
            <div class="answer-input-wrapper">
                <textarea
                    class="answer-textarea"
                    id="textarea-${escapeAttr(q.id)}"
                    placeholder="Type your answer here, or select an option above..."
                    rows="3"
                ></textarea>
            </div>
        `;

        html += `</div>`;
        section.innerHTML = html;
        container.appendChild(section);
    });

    /**
     * ════════════════════════════════════════
     * INTERACTION LOGIC
     * ════════════════════════════════════════
     */
    function selectOption(option) {
        if (!option) return;

        const qid = option.dataset.qid;
        const val = option.dataset.val;

        // Deselect current in this question grid
        const grid = option.closest('.options-grid');
        grid.querySelectorAll('.option-item').forEach(btn => btn.classList.remove('selected'));
        option.classList.add('selected');

        // Pre-fill textarea with the selected option's text
        const textarea = document.getElementById(`textarea-${qid}`);
        if (textarea) {
            textarea.value = val;
            answers[qid] = { selected: val };
        } else {
            // Wait, looking at the code, if textarea doesn't exist, how is the answer recorded?
            answers[qid] = { selected: val };
        }

        checkSubmitValidation();
    }

    container.addEventListener('click', (e) => {
        // Handle Info Toggle
        const infoToggle = e.target.closest('.info-toggle');
        if (infoToggle) {
            e.stopPropagation();
            const wrapper = infoToggle.closest('.option-wrapper');
            const desc = wrapper.querySelector('.option-description');

            if (desc.classList.contains('hidden')) {
                desc.classList.remove('hidden');
                infoToggle.classList.add('active');
            } else {
                desc.classList.add('hidden');
                infoToggle.classList.remove('active');
            }
            return;
        }

        const option = e.target.closest('.option-item');
        if (option) {
            selectOption(option);
        }
    });

    // Textarea sync — user edits freely at any time
    container.addEventListener('input', (e) => {
        if (e.target.classList.contains('answer-textarea') || e.target.classList.contains('custom-textarea')) {
            const qid = e.target.id.replace('textarea-', '');
            const text = e.target.value;
            answers[qid] = { selected: text };

            // If textarea was edited after selecting an option, deselect
            const grid = e.target.closest('.options-grid');
            grid.querySelectorAll('.option-item').forEach(btn => btn.classList.remove('selected'));

            checkSubmitValidation();
        }
    });

    /**
     * ════════════════════════════════════════
     * KEYBOARD NAVIGATION
     * ════════════════════════════════════════
     */
    document.addEventListener('keydown', (e) => {
        // Do not intercept if user is typing in a textarea or input
        if (['textarea', 'input'].includes(e.target.tagName.toLowerCase())) {
            return;
        }

        if (e.key === 'ArrowRight') {
            e.preventDefault();
            goToPage(activeIndex + 1);
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            goToPage(activeIndex - 1);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const activeSection = sections[activeIndex];
            if (!activeSection) return;
            
            const options = Array.from(activeSection.querySelectorAll('.option-item'));
            if (options.length === 0) return;

            const currentIndex = options.findIndex(opt => opt.classList.contains('selected'));
            let nextIndex = 0;

            if (e.key === 'ArrowDown') {
                nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % options.length;
            } else {
                nextIndex = currentIndex === -1 ? options.length - 1 : (currentIndex - 1 + options.length) % options.length;
            }

            selectOption(options[nextIndex]);
            
            // Scroll selected option into view if needed (useful for long lists)
            options[nextIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex === questionsCount - 1) {
                if (!submitBtn.disabled) submitBtn.click();
            } else {
                goToPage(activeIndex + 1);
            }
        }
    });

    function checkSubmitValidation() {
        let allRequiredFilled = true;
        data.questions.forEach(q => {
            if (q.required) {
                const answer = answers[q.id];
                if (!answer || !answer.selected || !answer.selected.trim()) {
                    allRequiredFilled = false;
                }
            }
        });
        submitBtn.disabled = !allRequiredFilled;
    }

    /**
     * ════════════════════════════════════════
     * TESLA SCROLL ENGINE
     * ════════════════════════════════════════
     */
    const sections = document.querySelectorAll('.question-section');

    function updateSections() {
        sections.forEach((sec, idx) => {
            sec.classList.remove('active', 'prev', 'next');
            if (idx === activeIndex) {
                sec.classList.add('active');
            } else if (idx < activeIndex) {
                sec.classList.add('prev');
            } else {
                sec.classList.add('next');
            }
        });

        // Update UI
        currentQEl.textContent = activeIndex + 1;
        updateNavButtons(activeIndex);
    }

    // Initial state
    updateSections();

    let isTransitioning = false;
    let scrollAccumulator = 0;
    const SCROLL_THRESHOLD = 40;
    const COOLDOWN = 800;

    function goToPage(index) {
        if (index < 0 || index >= questionsCount || isTransitioning) return;

        isTransitioning = true;
        activeIndex = index;
        updateSections();

        setTimeout(() => {
            isTransitioning = false;
            scrollAccumulator = 0;
        }, COOLDOWN);
    }

    function isScrollable(el) {
        const hasScrollableContent = el.scrollHeight > el.clientHeight;
        const overflowYStyle = window.getComputedStyle(el).overflowY;
        const isOverflowHidden = overflowYStyle.indexOf('hidden') !== -1;
        return hasScrollableContent && !isOverflowHidden;
    }

    // Wheel Handler (Desktop)
    container.addEventListener('wheel', (e) => {
        const scrollableTarget = e.target.closest('.option-description');
        if (scrollableTarget && isScrollable(scrollableTarget)) {
            const atTop = scrollableTarget.scrollTop === 0 && e.deltaY < 0;
            const atBottom = Math.abs(scrollableTarget.scrollHeight - scrollableTarget.clientHeight - scrollableTarget.scrollTop) <= 1 && e.deltaY > 0;

            if (!atTop && !atBottom) {
                return;
            }
        }

        e.preventDefault();
        if (isTransitioning) return;

        const rawDelta = e.deltaY;
        const velocityMultiplier = Math.min(Math.abs(rawDelta) / 20, 3);
        const delta = Math.sign(rawDelta) * Math.pow(Math.abs(rawDelta), 1.2) * velocityMultiplier;

        scrollAccumulator += delta;

        if (Math.abs(scrollAccumulator) >= SCROLL_THRESHOLD * 2) {
            if (scrollAccumulator > 0) {
                goToPage(activeIndex + 1);
            } else {
                goToPage(activeIndex - 1);
            }
        }
    }, { passive: false });

    // Touch Handler (Mobile/Trackpad)
    let touchStartY = 0;
    let touchStartTime = 0;

    container.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
    }, { passive: true });

    container.addEventListener('touchend', (e) => {
        const scrollableTarget = e.target.closest('.option-description');
        if (scrollableTarget && isScrollable(scrollableTarget)) return;

        const touchEndY = e.changedTouches[0].clientY;
        const diff = touchStartY - touchEndY;
        const timeDiff = Date.now() - touchStartTime;
        const velocity = Math.abs(diff) / timeDiff;

        if (Math.abs(diff) > 60 || velocity > 0.5) {
            if (diff > 0) {
                goToPage(activeIndex + 1);
            } else {
                goToPage(activeIndex - 1);
            }
        }
    }, { passive: true });

    function updateNavButtons(index) {
        if (index === 0) {
            prevBtn.classList.add('hidden');
        } else {
            prevBtn.classList.remove('hidden');
        }

        if (index === questionsCount - 1) {
            nextBtn.classList.add('hidden');
            submitBtn.classList.remove('hidden');
        } else {
            nextBtn.classList.remove('hidden');
            submitBtn.classList.add('hidden');
        }
    }

    prevBtn.addEventListener('click', () => goToPage(activeIndex - 1));
    nextBtn.addEventListener('click', () => goToPage(activeIndex + 1));

    /**
     * ════════════════════════════════════════
     * TIMER LOGIC
     * ════════════════════════════════════════
     */
    const timerInterval = setInterval(() => {
        timeLeft -= 1;
        updateTimerDisplay();
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            autoSubmit();
        }
    }, 1000);

    function updateTimerDisplay() {
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        timerLabel.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        if (timeLeft < 30) {
            timerLabel.parentElement.style.borderColor = 'var(--error-color)';
            timerLabel.style.color = 'var(--error-color)';
        }
    }

    /**
     * ════════════════════════════════════════
     * EVENT EMITTERS (VS Code Bridge)
     * ════════════════════════════════════════
     */
    submitBtn.addEventListener('click', () => {
        if (quizSubmitted) return;
        quizSubmitted = true;
        clearInterval(timerInterval);

        const payload = Object.entries(answers).map(([id, answer]) => ({
            id,
            selected: answer.selected,
        }));

        vscode.postMessage({ type: 'answer', data: payload });
    });

    quitBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'quit' });
    });

    function autoSubmit() {
        if (quizSubmitted) return;
        quizSubmitted = true;
        vscode.postMessage({ type: 'answer', data: [], timedOut: true });
    }

    // Initial check
    checkSubmitValidation();
});

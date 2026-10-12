(() => {
    const form = document.querySelector('.listing-form'), equipment = document.getElementById('equipment');
    if (!form || !equipment) return;
    const groups = [...form.querySelectorAll('[data-category]')];
    const refresh = () => groups.forEach(group => {
        const active = group.dataset.category === equipment.value;
        group.hidden = !active; group.disabled = !active;
    });
    const categoryNote = document.createElement('p'); categoryNote.className = 'field-note'; categoryNote.setAttribute('role', 'status'); equipment.insertAdjacentElement('afterend', categoryNote);
    equipment.addEventListener('change', () => { categoryNote.textContent = 'Review the brand, condition, faults and accessories for this category. Its specifications are blank.'; groups.forEach(group => group.querySelectorAll('input,select').forEach(field => { field.value = ''; })); refresh(); });
    refresh();
    // Move server errors beside their fields and make category-specific links target the active section.
    form.querySelectorAll('[data-error-for]').forEach(error => {
        const name = error.dataset.errorFor;
        const field = [...form.elements].find(item => item.name === name && !item.closest('[data-category]')?.disabled);
        if (field) { field.insertAdjacentElement('afterend', error); form.querySelector(`.server-errors a[href="#${name}"]`)?.setAttribute('href', `#${field.id}`); }
    });
    form.querySelector('.server-errors')?.focus();
})();

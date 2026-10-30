document.addEventListener('DOMContentLoaded', () => {
    const toolList = document.getElementById('toolList');
    const toolName = document.getElementById('toolName');
    const toolDesc = document.getElementById('toolDesc');
    const formContainer = document.getElementById('formContainer');
    const resultOutput = document.getElementById('resultOutput');
    const copyBtn = document.getElementById('copyBtn');
    const toast = document.getElementById('toast');

    let allTools = [];
    let activeTool = null;

    // Fetch tools from API
    async function fetchTools() {
        try {
            const response = await fetch('/api/tools');
            allTools = await response.json();
            renderToolList();
        } catch (error) {
            showToast('Failed to fetch tools', 'error');
            toolList.innerHTML = '<div class="error">Error loading tools.</div>';
        }
    }

    function renderToolList() {
        toolList.innerHTML = '';
        allTools.forEach(tool => {
            const item = document.createElement('div');
            item.className = 'tool-item';
            item.innerHTML = `<span class="name">${tool.name}</span>`;
            item.onclick = event => selectTool(tool, event.currentTarget);
            toolList.appendChild(item);
        });
    }

    function selectTool(tool, element) {
        activeTool = tool;
        
        // Update UI
        document.querySelectorAll('.tool-item').forEach(el => el.classList.remove('active'));
        element.classList.add('active');
        
        toolName.textContent = tool.name;
        toolDesc.textContent = tool.description;
        
        renderForm(tool);
    }

    function renderForm(tool) {
        const schema = tool.inputSchema;
        let html = '<div class="tool-form">';
        
        if (schema.properties) {
            Object.entries(schema.properties).forEach(([key, prop]) => {
                if (prop['x-alias-for']) return;
                const required = schema.required?.includes(key) ? 'required' : '';
                html += `
                    <div class="form-group">
                        <label>${key} ${required ? '<span style="color: #ef4444">*</span>' : ''}</label>
                        ${renderField(key, prop, required)}
                        <small style="color: #64748b; font-size: 11px; margin-top: 4px; display: block;">${prop.description || ''}</small>
                    </div>
                `;
            });
        }
        
        html += `<button class="btn-primary" id="executeBtn">Execute Tool</button></div>`;
        formContainer.innerHTML = html;

        document.getElementById('executeBtn').onclick = executeTool;
    }

    function renderField(key, prop, required) {
        if (prop.type === 'object' || prop.type === 'array' || Array.isArray(prop.type)) {
            return `<textarea id="field_${key}" placeholder='{"key": "value"}' ${required}></textarea>`;
        } else if (prop.type === 'number' || prop.type === 'integer') {
            return `<input type="number" id="field_${key}" ${prop.type === 'integer' ? 'step="1"' : ''} ${required}>`;
        } else if (prop.type === 'boolean') {
             return `<select id="field_${key}"><option value="">Default${prop.default !== undefined ? ' (' + prop.default + ')' : ''}</option><option value="true">true</option><option value="false">false</option></select>`;
        }
        return `<input type="text" id="field_${key}" placeholder="${prop.description || ''}" ${required}>`;
    }

    async function executeTool() {
        const btn = document.getElementById('executeBtn');
        const args = {};
        
        // Gather arguments
        Object.keys(activeTool.inputSchema.properties || {}).forEach(key => {
            const input = document.getElementById(`field_${key}`);
            if (!input || activeTool.inputSchema.properties[key]['x-alias-for'] || input.value === '') return;
            const type = activeTool.inputSchema.properties[key].type;
            
            if (type === 'object' || type === 'array' || Array.isArray(type)) {
                try {
                    args[key] = input.value ? JSON.parse(input.value) : {};
                } catch (e) {
                    showToast(`Invalid JSON in field "${key}"`, 'error');
                    throw e;
                }
            } else if (type === 'number' || type === 'integer') {
                args[key] = Number(input.value);
            } else if (type === 'boolean') {
                args[key] = input.value === 'true';
            } else {
                args[key] = input.value;
            }
        });

        btn.disabled = true;
        btn.textContent = 'Executing...';
        resultOutput.textContent = '// Waiting for response...';
        
        try {
            const response = await fetch('/api/call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: activeTool.name, arguments: args })
            });
            
            const result = await response.json();
            resultOutput.textContent = JSON.stringify(result, null, 2);
            showToast('Execution complete');
        } catch (error) {
            resultOutput.textContent = JSON.stringify({ error: error.message }, null, 2);
            showToast('Execution failed', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Execute Tool';
        }
    }

    function showToast(message, type = 'success') {
        toast.textContent = message;
        toast.style.background = type === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(16, 185, 129, 0.9)';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    copyBtn.onclick = () => {
        navigator.clipboard.writeText(resultOutput.textContent);
        showToast('Copied to clipboard');
    };

    fetchTools();
});


// Inicialización cuando el DOM está completamente cargado
document.addEventListener('DOMContentLoaded', function() {
    // Inicializar mermaid con configuración robusta para diagramas ER
    mermaid.initialize({ 
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
        er: {
            layoutDirection: 'TB',
            minEntityWidth: 100,
            minEntityHeight: 75,
            entityPadding: 15
        }
    });

    // Estado global de la aplicación
    const appState = {
        connected: false,
        currentDatabase: null,
        connectionParams: {},
        mermaidInitialized: false
    };

    // Cargar configuración guardada
    function loadSavedConfig() {
        const savedConfig = localStorage.getItem('dbConnectionConfig');
        if (savedConfig) {
            try {
                const config = JSON.parse(savedConfig);
                document.getElementById('server').value = config.server || '';
                document.getElementById('database').value = config.database || '';
                document.getElementById('username').value = config.username || '';
                showAlert('Configuración cargada correctamente', 'info');
            } catch (e) {
                console.error('Error loading saved configuration:', e);
            }
        }
    }

    // Guardar configuración
    function saveConfig() {
        const config = {
            server: document.getElementById('server').value,
            database: document.getElementById('database').value,
            username: document.getElementById('username').value
        };
        localStorage.setItem('dbConnectionConfig', JSON.stringify(config));
        showAlert('Configuración guardada correctamente', 'success');
    }

    // Función para mostrar alertas emergentes
    function showAlert(message, type = 'info') {
        const alertContainer = document.querySelector('.alert-container');
        
        if (alertContainer.children.length >= 3) {
            alertContainer.removeChild(alertContainer.children[0]);
        }
        
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.role = 'alert';
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        alertContainer.appendChild(alert);
        
        setTimeout(() => {
            if (alert.parentNode) {
                alert.remove();
            }
        }, 5000);
    }

    // Función para inicializar Mermaid de forma segura
    function initializeMermaid() {
        try {
            mermaid.initialize({ 
                startOnLoad: false,
                theme: 'default',
                securityLevel: 'loose',
                er: {
                    layoutDirection: 'TB',
                    minEntityWidth: 100,
                    minEntityHeight: 75,
                    entityPadding: 15
                }
            });
            appState.mermaidInitialized = true;
            return true;
        } catch (error) {
            console.error('Error inicializando Mermaid:', error);
            showAlert('Error al inicializar Mermaid: ' + error.message, 'danger');
            return false;
        }
    }

    // Función para forzar reinicio completo de Mermaid
    function forceMermaidReset() {
        try {
            showAlert('Reiniciando Mermaid...', 'info');
            
            const mermaidElements = document.querySelectorAll('.mermaid');
            mermaidElements.forEach(element => {
                const parent = element.parentNode;
                const newElement = document.createElement('div');
                newElement.className = 'mermaid';
                newElement.textContent = element.textContent;
                parent.replaceChild(newElement, element);
            });
            
            initializeMermaid();
            
            try {
                mermaid.init(undefined, document.querySelectorAll('.mermaid'));
                showAlert('Mermaid reiniciado correctamente', 'success');
                return true;
            } catch (error) {
                console.error('Error al renderizar después del reset:', error);
                return false;
            }
        } catch (error) {
            console.error('Error reiniciando Mermaid:', error);
            return false;
        }
    }

    // Función para convertir el formato del backend a Mermaid válido para ER/EER
    function convertToValidMermaidER(backendCode) {
        try {
            let mermaidCode = 'erDiagram\n';
            const lines = backendCode.split('\n');
            let currentEntity = '';
            
            for (const line of lines) {
                const trimmedLine = line.trim();
                
                if (!trimmedLine) continue;
                
                if (trimmedLine.endsWith('{') && !trimmedLine.includes('||--o{')) {
                    const entityName = trimmedLine.replace('{', '').trim();
                    mermaidCode += `    ${entityName} {\n`;
                    currentEntity = entityName;
                }
                else if (trimmedLine === '}') {
                    mermaidCode += '    }\n';
                    currentEntity = '';
                }
                else if (currentEntity && /(int|varchar|text|decimal|datetime|date|bit)\s+\w+/.test(trimmedLine)) {
                    const parts = trimmedLine.split(' ');
                    if (parts.length >= 2) {
                        const type = parts[0];
                        const name = parts[1];
                        let modifiers = parts.slice(2).join(' ');
                        
                        if (modifiers.includes('PK')) {
                            mermaidCode += `        ${type} ${name} PK\n`;
                        } else if (modifiers.includes('FK')) {
                            mermaidCode += `        ${type} ${name} FK\n`;
                        } else if (modifiers.includes('NULL')) {
                            mermaidCode += `        ${type} ${name} NULL\n`;
                        } else {
                            mermaidCode += `        ${type} ${name}\n`;
                        }
                    }
                }
                else if (trimmedLine.includes('||--o{') || trimmedLine.includes('}o--||')) {
                    const relationParts = trimmedLine.split('||--o{');
                    if (relationParts.length === 2) {
                        const leftSide = relationParts[0].trim();
                        let rightSide = relationParts[1].trim();
                        
                        let description = "relacionado_con";
                        if (rightSide.includes(':')) {
                            const rightParts = rightSide.split(':');
                            rightSide = rightParts[0].trim();
                            if (rightParts[1]) {
                                description = rightParts[1].replace(/"/g, '').trim();
                            }
                        }
                        
                        mermaidCode += `    ${leftSide} ||--o{ ${rightSide} : "${description}"\n`;
                    }
                }
            }
            
            return mermaidCode;
        } catch (error) {
            console.error('Error convirtiendo a Mermaid válido:', error);
            return null;
        }
    }

    // Función para convertir el formato del backend a Mermaid válido para Modelo Relacional
    function convertToValidMermaidRelational(backendCode) {
        try {
            let mermaidCode = 'erDiagram\n';
            const lines = backendCode.split('\n');
            let currentTable = '';
            
            for (const line of lines) {
                const trimmedLine = line.trim();
                
                if (!trimmedLine) continue;
                
                if (trimmedLine.endsWith('(') && !trimmedLine.includes('FOREIGN KEY')) {
                    const tableName = trimmedLine.replace('(', '').trim();
                    mermaidCode += `    ${tableName} {\n`;
                    currentTable = tableName;
                }
                else if (trimmedLine === ')') {
                    mermaidCode += '    }\n';
                    currentTable = '';
                }
                else if (currentTable && /(int|varchar|text|decimal|datetime|date|bit)\s+\w+/.test(trimmedLine)) {
                    const parts = trimmedLine.split(' ');
                    if (parts.length >= 2) {
                        const type = parts[0];
                        const name = parts[1];
                        let modifiers = parts.slice(2).join(' ');
                        
                        if (modifiers.includes('PK')) {
                            mermaidCode += `        ${type} ${name} PK\n`;
                        } else if (modifiers.includes('FK')) {
                            mermaidCode += `        ${type} ${name} FK\n`;
                        } else if (modifiers.includes('NULL')) {
                            mermaidCode += `        ${type} ${name} NULL\n`;
                        } else {
                            mermaidCode += `        ${type} ${name}\n`;
                        }
                    }
                }
                else if (trimmedLine.includes('FOREIGN KEY')) {
                    const match = trimmedLine.match(/FOREIGN KEY\s*\((.*?)\)\s*REFERENCES\s*(.*?)\s*\((.*?)\)/);
                    if (match) {
                        const fkColumn = match[1];
                        const refTable = match[2];
                        const refColumn = match[3];
                        
                        mermaidCode += `    ${refTable} ||--o{ ${currentTable} : "${fkColumn} references ${refColumn}"\n`;
                    }
                }
            }
            
            return mermaidCode;
        } catch (error) {
            console.error('Error convirtiendo a Mermaid válido:', error);
            return null;
        }
    }

    // Función para renderizar diagramas Mermaid de forma segura
    function renderMermaidSafely(container, backendCode, diagramType = 'er') {
        try {
            container.innerHTML = '';
            
            const mermaidCode = diagramType === 'er' 
                ? convertToValidMermaidER(backendCode) 
                : convertToValidMermaidRelational(backendCode);
            
            if (!mermaidCode) {
                throw new Error('No se pudo convertir el diagrama a formato Mermaid válido');
            }
            
            const mermaidDiv = document.createElement('div');
            mermaidDiv.className = 'mermaid';
            mermaidDiv.textContent = mermaidCode;
            
            container.appendChild(mermaidDiv);
            
            try {
                mermaid.init(undefined, [mermaidDiv]);
                return true;
            } catch (renderError) {
                console.error('Error renderizando Mermaid:', renderError);
                
                container.innerHTML = `
                    <div class="mermaid-error">
                        <h5><i class="fas fa-exclamation-triangle"></i> Error renderizando diagrama Mermaid</h5>
                        <p>${renderError.message}</p>
                        <div class="mt-3">
                            <button class="btn btn-sm btn-primary me-2" id="retry-mermaid-btn">Reintentar</button>
                            <button class="btn btn-sm btn-secondary" id="view-text-btn">Ver como texto</button>
                        </div>
                        <details class="mt-3">
                            <summary>Ver código Mermaid generado</summary>
                            <pre class="mt-2 p-2 bg-light border rounded">${mermaidCode}</pre>
                        </details>
                    </div>
                `;
                
                document.getElementById('retry-mermaid-btn').addEventListener('click', function() {
                    renderMermaidSafely(container, backendCode, diagramType);
                });
                
                document.getElementById('view-text-btn').addEventListener('click', function() {
                    renderAsTextDiagram(container, backendCode);
                });
                
                return false;
            }
        } catch (error) {
            console.error('Error en renderMermaidSafely:', error);
            container.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i> Error crítico: ${error.message}
                </div>
            `;
            return false;
        }
    }

    // Función para mostrar el diagrama como texto formateado
    function renderAsTextDiagram(container, diagramCode) {
        try {
            container.innerHTML = '';
            
            const textContainer = document.createElement('div');
            textContainer.className = 'er-text-diagram';
            
            if (!diagramCode || diagramCode.trim() === '') {
                textContainer.textContent = 'No hay datos para mostrar.';
                container.appendChild(textContainer);
                return false;
            }
            
            textContainer.textContent = diagramCode;
            container.appendChild(textContainer);
            
            return true;
        } catch (error) {
            console.error('Error en renderAsTextDiagram:', error);
            container.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i> Error mostrando diagrama como texto: ${error.message}
                </div>
            `;
            return false;
        }
    }

    // Función para limpiar mensajes de error del formulario
    function clearErrorMessages() {
        document.getElementById('server-error').textContent = '';
        document.getElementById('database-error').textContent = '';
        document.getElementById('username-error').textContent = '';
        document.getElementById('password-error').textContent = '';
    }

    // Función para validar los campos de conexión
    function validateConnectionFields() {
        let isValid = true;
        const server = document.getElementById('server').value;
        const database = document.getElementById('database').value;
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        clearErrorMessages();

        if (!server) {
            document.getElementById('server-error').textContent = 'El servidor es requerido';
            isValid = false;
        }

        if (!database) {
            document.getElementById('database-error').textContent = 'La base de datos es requerida';
            isValid = false;
        }

        if (!username) {
            document.getElementById('username-error').textContent = 'El usuario es requerido';
            isValid = false;
        }

        if (!password) {
            document.getElementById('password-error').textContent = 'La contraseña es requerida';
            isValid = false;
        }

        return isValid;
    }

    // Event listener para el botón de conexión
    document.getElementById('connect-btn').addEventListener('click', function() {
        if (!validateConnectionFields()) {
            showAlert('Por favor, complete todos los campos requeridos', 'warning');
            return;
        }

        const server = document.getElementById('server').value;
        const database = document.getElementById('database').value;
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        const connectBtn = document.getElementById('connect-btn');
        connectBtn.disabled = true;
        connectBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Conectando...';
        
        appState.connectionParams = { server, database, username, password };
        
        fetch('http://localhost:5000/api/connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(appState.connectionParams)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                appState.connected = true;
                appState.currentDatabase = database;
                document.getElementById('connection-status').textContent = 'Conectado';
                document.getElementById('connection-status').className = 'connection-status status-connected';
                
                updateEntityAndRelationshipLists();
                
                showAlert('Conexión exitosa a la base de datos', 'success');
            } else {
                showAlert('Error de conexión: ' + data.message, 'danger');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showAlert('Error de conexión: ' + error.message, 'danger');
        })
        .finally(() => {
            // Restaurar botón de conexión
            connectBtn.disabled = false;
            connectBtn.innerHTML = '<i class="fas fa-plug me-1"></i> Conectar';
        });
    });

    // Event listener para el botón de guardar configuración
    document.getElementById('save-config-btn').addEventListener('click', function() {
        saveConfig();
    });

    // Event listener para el botón de restablecer
    document.getElementById('reset-btn').addEventListener('click', function() {
        document.getElementById('server').value = '';
        document.getElementById('database').value = '';
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        
        clearErrorMessages();
        
        appState.connected = false;
        appState.currentDatabase = null;
        document.getElementById('connection-status').textContent = 'Desconectado';
        document.getElementById('connection-status').className = 'connection-status status-disconnected';
        
        document.getElementById('entities-list').innerHTML = '<li class="list-group-item">Esperando conexión...</li>';
        document.getElementById('relationships-list').innerHTML = '<li class="list-group-item">Esperando conexión...</li>';
        
        showAlert('Formulario restablecido', 'info');
    });

    // Función para actualizar las listas de entidades y relaciones
    function updateEntityAndRelationshipLists() {
        fetch('http://localhost:5000/api/getEntitiesAndRelationships', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(appState.connectionParams)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                const entitiesList = document.getElementById('entities-list');
                const relationshipsList = document.getElementById('relationships-list');
                
                entitiesList.innerHTML = '';
                relationshipsList.innerHTML = '';
                
                if (data.entities && data.entities.length > 0) {
                    data.entities.forEach(entity => {
                        const li = document.createElement('li');
                        li.className = 'list-group-item';
                        li.innerHTML = `<i class="fas fa-table me-2"></i>${entity}`;
                        entitiesList.appendChild(li);
                    });
                } else {
                    entitiesList.innerHTML = '<li class="list-group-item">No se encontraron entidades</li>';
                }
                
                if (data.relationships && data.relationships.length > 0) {
                    data.relationships.forEach(relationship => {
                        const li = document.createElement('li');
                        li.className = 'list-group-item';
                        li.innerHTML = `<i class="fas fa-link me-2"></i>${relationship}`;
                        relationshipsList.appendChild(li);
                    });
                } else {
                    relationshipsList.innerHTML = '<li class="list-group-item">No se encontraron relaciones</li>';
                }
            } else {
                showAlert('Error obteniendo información de la base de datos: ' + data.message, 'danger');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showAlert('Error obteniendo información de la base de datos: ' + error.message, 'danger');
        });
    }

    // Event listener para el botón de generar diagrama ER/EER
    document.getElementById('generate-btn').addEventListener('click', function() {
        if (!appState.connected) {
            showAlert('Primero debe conectarse a una base de datos', 'warning');
            return;
        }
        
        const visualizationType = document.getElementById('visualization-type').value;
        const showCardinalities = document.getElementById('show-cardinalities').checked;
        const showAttributes = document.getElementById('show-attributes').checked;
        
        const progressBar = document.querySelector('#eer-progress .progress-bar');
        document.getElementById('eer-progress').style.display = 'block';
        
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += 5;
            progressBar.style.width = `${progress}%`;
            progressBar.setAttribute('aria-valuenow', progress);
            
            if (progress >= 100) {
                clearInterval(progressInterval);
            }
        }, 100);
        
        fetch('http://localhost:5000/api/generateEERDiagram', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ...appState.connectionParams,
                visualization_type: visualizationType,
                show_cardinalities: showCardinalities,
                show_attributes: showAttributes
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            clearInterval(progressInterval);
            progressBar.style.width = '100%';
            
            setTimeout(() => {
                document.getElementById('eer-progress').style.display = 'none';
            }, 500);
            
            if (data.success) {
                const diagramContainer = document.getElementById('eer-diagram');
                
                if (visualizationType === 'mermaid') {
                    const mermaidSuccess = renderMermaidSafely(diagramContainer, data.diagram, 'er');
                    
                    if (!mermaidSuccess) {
                        showAlert('Mostrando diagrama en formato texto', 'info');
                        renderAsTextDiagram(diagramContainer, data.diagram);
                    } else {
                        showAlert('Diagrama ER/EER generado exitosamente', 'success');
                    }
                } else {
                    renderAsTextDiagram(diagramContainer, data.diagram);
                    showAlert('Diagrama ER/EER generado exitosamente', 'success');
                }
            } else {
                document.getElementById('eer-diagram').innerHTML = `
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-triangle"></i> Error generando diagrama: ${data.message}
                    </div>
                `;
                showAlert('Error generando diagrama: ' + data.message, 'danger');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            clearInterval(progressInterval);
            document.getElementById('eer-progress').style.display = 'none';
            
            document.getElementById('eer-diagram').innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i> Error generando diagrama: ${error.message}
                </div>
            `;
            showAlert('Error generando diagrama: ' + error.message, 'danger');
        });
    });

    // Event listener para el botón de exportar diagrama
    document.getElementById('export-btn').addEventListener('click', function() {
        if (!appState.connected) {
            showAlert('Primero debe conectarse a una base de datos', 'warning');
            return;
        }
        
        fetch('http://localhost:5000/api/exportDiagram', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ...appState.connectionParams,
                diagram_type: 'eer'
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                const a = document.createElement('a');
                a.href = data.file_url;
                a.download = data.file_name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                
                showAlert('Diagrama exportado exitosamente', 'success');
            } else {
                showAlert('Error exportando diagrama: ' + data.message, 'danger');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showAlert('Error exportando diagrama: ' + error.message, 'danger');
        });
    });

    // Event listener para el botón de reparar Mermaid
    document.getElementById('fix-mermaid-btn').addEventListener('click', function() {
        if (forceMermaidReset()) {
            showAlert('Mermaid ha sido reiniciado. Intente generar el diagrama nuevamente.', 'success');
        } else {
            showAlert('No se pudo reiniciar Mermaid. Intente recargar la página.', 'warning');
        }
    });

    // Event listener para el botón de generar modelo relacional
    document.getElementById('generate-relational-btn').addEventListener('click', function() {
        if (!appState.connected) {
            showAlert('Primero debe conectarse a una base de datos', 'warning');
            return;
        }
        
        const progressBar = document.querySelector('#relational-progress .progress-bar');
        document.getElementById('relational-progress').style.display = 'block';
        
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += 5;
            progressBar.style.width = `${progress}%`;
            progressBar.setAttribute('aria-valuenow', progress);
            
            if (progress >= 100) {
                clearInterval(progressInterval);
            }
        }, 100);
        
        fetch('http://localhost:5000/api/generateRelationalModel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(appState.connectionParams)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            clearInterval(progressInterval);
            progressBar.style.width = '100%';
            
            setTimeout(() => {
                document.getElementById('relational-progress').style.display = 'none';
            }, 500);
            
            if (data.success) {
                const diagramContainer = document.getElementById('relational-diagram');
                
                const mermaidSuccess = renderMermaidSafely(diagramContainer, data.model, 'relational');
                
                if (!mermaidSuccess) {
                    showAlert('Mostrando modelo relacional en formato texto', 'info');
                    renderAsTextDiagram(diagramContainer, data.model);
                } else {
                    showAlert('Modelo relacional generado exitosamente', 'success');
                }
            } else {
                document.getElementById('relational-diagram').innerHTML = `
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-triangle"></i> Error generando modelo relacional: ${data.message}
                    </div>
                `;
                showAlert('Error generando modelo relacional: ' + data.message, 'danger');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            clearInterval(progressInterval);
            document.getElementById('relational-progress').style.display = 'none';
            
            document.getElementById('relational-diagram').innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i> Error generando modelo relacional: ${error.message}
                </div>
            `;
            showAlert('Error generando modelo relacional: ' + error.message, 'danger');
        });
    });

    // Event listener para el botón de exportar modelo relacional
    document.getElementById('export-relational-btn').addEventListener('click', function() {
        if (!appState.connected) {
            showAlert('Primero debe conectarse a una base de datos', 'warning');
            return;
        }
        
        fetch('http://localhost:5000/api/exportRelationalModel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(appState.connectionParams)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                const a = document.createElement('a');
                a.href = data.file_url;
                a.download = data.file_name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                
                showAlert('Modelo relacional exportado exitosamente', 'success');
            } else {
                showAlert('Error exportando modelo relacional: ' + data.message, 'danger');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showAlert('Error exportando modelo relacional: ' + error.message, 'danger');
        });
    });

    // Función para traducir SQL a Álgebra Relacional
    function sqlToAlgebra(sqlQuery) {
        try {
            const sql = sqlQuery.toLowerCase().trim();
            
            const selectPattern = /select\s+(.*?)\s+from\s+(\w+)(?:\s+where\s+(.*))?/;
            const joinPattern = /select\s+.*?\s+from\s+(\w+)\s+join\s+(\w+)\s+on\s+(.*)/;
            
            const selectMatch = sql.match(selectPattern);
            if (selectMatch) {
                let columns = selectMatch[1];
                const table = selectMatch[2];
                const condition = selectMatch[3] || null;
                
                if (columns === '*') {
                    columns = 'todas_las_columnas';
                }
                
                let arExpression = `π ${columns} `;
                if (condition) {
                    arExpression += `(σ ${condition} (${table}))`;
                } else {
                    arExpression += `(${table})`;
                }
                
                return arExpression;
            }
            
            const joinMatch = sql.match(joinPattern);
            if (joinMatch) {
                const table1 = joinMatch[1];
                const table2 = joinMatch[2];
                const joinCondition = joinMatch[3];
                
                const columnsMatch = sql.match(/select\s+(.*?)\s+from/);
                let columns = columnsMatch ? columnsMatch[1] : '*';
                
                if (columns === '*') {
                    columns = 'todas_las_columnas';
                }
                
                return `π ${columns} (${table1} ⨝ ${table2})`;
            }
            
            return "Tipo de consulta SQL no soportado para traducción";
            
        } catch (error) {
            console.error('Error en traducción SQL a AR:', error);
            return `Error en la traducción: ${error.message}`;
        }
    }

    // Función para traducir Álgebra Relacional a SQL (mejorada)
    function algebraToSql(arExpression) {
        try {
            // Análisis básico de expresiones de álgebra relacional
            const ar = arExpression.trim();
            
            // Patrones para diferentes operaciones
            const projectionPattern = /π\s+([^*].*?)\s+\((.*)\)/;
            const selectionPattern = /σ\s+(.*?)\s+\((.*)\)/;
            const joinPattern = /\((.*)\)\s+⨝\s+\((.*)\)/;
            
            // Verificar si es una proyección
            const projectionMatch = ar.match(projectionPattern);
            if (projectionMatch) {
                let columns = projectionMatch[1].trim();
                const innerExpression = projectionMatch[2].trim();
                
                // Si la expresión interna es una selección
                const selectionMatch = innerExpression.match(selectionPattern);
                if (selectionMatch) {
                    const condition = selectionMatch[1].trim();
                    const table = selectionMatch[2].trim();
                    
                    // Manejar "todas_las_columnas" como *
                    if (columns === 'todas_las_columnas') {
                        columns = '*';
                    }
                    
                    return `SELECT ${columns} FROM ${table} WHERE ${condition}`;
                } else {
                    // Es solo una tabla
                    if (columns === 'todas_las_columnas') {
                        columns = '*';
                    }
                    
                    return `SELECT ${columns} FROM ${innerExpression}`;
                }
            }
            
            // Verificar si es una selección
            const selectionMatch = ar.match(selectionPattern);
            if (selectionMatch) {
                const condition = selectionMatch[1].trim();
                const table = selectionMatch[2].trim();
                return `SELECT * FROM ${table} WHERE ${condition}`;
            }
            
            // Verificar si es un join
            const joinMatch = ar.match(joinPattern);
            if (joinMatch) {
                const table1 = joinMatch[1].trim();
                const table2 = joinMatch[2].trim();
                return `SELECT * FROM ${table1} JOIN ${table2} ON [condición]`;
            }
            
            // Si es solo un nombre de tabla
            if (/^\w+$/.test(ar)) {
                return `SELECT * FROM ${ar}`;
            }
            
            return "Expresión de álgebra relacional no soportada para traducción";
            
        } catch (error) {
            console.error('Error en traducción AR a SQL:', error);
            return `Error en la traducción: ${error.message}`;
        }
    }

    // Event listener para el botón de traducción SQL a Álgebra Relacional
    document.getElementById('translate-sql-to-ar-btn').addEventListener('click', function() {
        const sqlQuery = document.getElementById('sql-query').value;
        
        if (!sqlQuery.trim()) {
            showAlert('Por favor, ingrese una consulta SQL', 'warning');
            return;
        }
        
        // Mostrar indicador de carga
        const button = document.getElementById('translate-sql-to-ar-btn');
        const originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Traduciendo...';
        
        // Usar timeout para simular procesamiento y permitir que la UI se actualice
        setTimeout(() => {
            try {
                const arExpression = sqlToAlgebra(sqlQuery);
                document.getElementById('ar-result').textContent = arExpression;
                showAlert('Traducción completada exitosamente', 'success');
            } catch (error) {
                document.getElementById('ar-result').textContent = `Error: ${error.message}`;
                showAlert('Error en la traducción: ' + error.message, 'danger');
            } finally {
                // Restaurar botón
                button.disabled = false;
                button.innerHTML = originalText;
            }
        }, 500);
    });

    // Event listener para el botón de traducción Álgebra Relacional a SQL
    document.getElementById('translate-ar-to-sql-btn').addEventListener('click', function() {
        const arExpression = document.getElementById('ar-expression').value;
        
        if (!arExpression.trim()) {
            showAlert('Por favor, ingrese una expresión de álgebra relacional', 'warning');
            return;
        }
        
        // Mostrar indicador de carga
        const button = document.getElementById('translate-ar-to-sql-btn');
        const originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Traduciendo...';
        
        // Usar timeout para simular procesamiento y permitir que la UI se actualice
        setTimeout(() => {
            try {
                const sqlQuery = algebraToSql(arExpression);
                document.getElementById('sql-result').textContent = sqlQuery;
                showAlert('Traducción completada exitosamente', 'success');
            } catch (error) {
                document.getElementById('sql-result').textContent = `Error: ${error.message}`;
                showAlert('Error en la traducción: ' + error.message, 'danger');
            } finally {
                // Restaurar botón
                button.disabled = false;
                button.innerHTML = originalText;
            }
        }, 500);
    });

    // Inicializar Mermaid al cargar la página
    initializeMermaid();
    
    // Cargar configuración guardada
    loadSavedConfig();
    
    // Mostrar mensaje de bienvenida
    showAlert('Sistema de Conversión de Base de Datos cargado correctamente', 'success');
});

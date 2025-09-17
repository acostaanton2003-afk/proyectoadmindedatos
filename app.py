from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import pyodbc
import re
import json
import os
from datetime import datetime

app = Flask(__name__)
CORS(app)

# Configuración de la aplicación
app.config['DEBUG'] = True
app.config['SECRET_KEY'] = 'supersecretkey'

# Configuración de la base de datos
DEFAULT_SERVER = r'ANTON\SQLEXPRESS'
DEFAULT_DATABASE = 'SistemaConversionDB1'
DEFAULT_USERNAME = 'sa'
DEFAULT_PASSWORD = '1234'  # Cambia esto por tu password real

# Función para conectar a la base de datos
def connect_to_db(server, database, username, password):
    try:
        conn_str = f'DRIVER={{SQL Server}};SERVER={server};DATABASE={database};UID={username};PWD={password}'
        conn = pyodbc.connect(conn_str)
        return conn, None
    except Exception as e:
        return None, str(e)

# Función para obtener información de la base de datos
def get_database_info(conn):
    try:
        cursor = conn.cursor()
        
        # Obtener tablas (entidades)
        cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'")
        tables = [row.TABLE_NAME for row in cursor.fetchall()]
        
        # Obtener relaciones (claves foráneas)
        cursor.execute("""
            SELECT 
                fk.name AS FK_Name,
                tp.name AS ParentTable,
                tr.name AS RefTable
            FROM 
                sys.foreign_keys fk
            INNER JOIN 
                sys.tables tp ON fk.parent_object_id = tp.object_id
            INNER JOIN 
                sys.tables tr ON fk.referenced_object_id = tr.object_id
        """)
        relationships = [f"{row.FK_Name}: {row.ParentTable} -> {row.RefTable}" for row in cursor.fetchall()]
        
        return {
            'entities': tables,
            'relationships': relationships
        }, None
        
    except Exception as e:
        return None, str(e)

# Función para generar diagrama ER/EER
def generate_eer_diagram(conn, visualization_type='text', show_cardinalities=True, show_attributes=True):
    try:
        cursor = conn.cursor()
        
        # Obtener información de tablas y columnas
        cursor.execute("""
            SELECT 
                t.name AS TableName,
                c.name AS ColumnName,
                ty.name AS TypeName,
                c.is_nullable,
                CASE WHEN EXISTS (
                    SELECT 1 
                    FROM sys.index_columns ic 
                    JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id 
                    WHERE ic.object_id = c.object_id AND ic.column_id = c.column_id AND i.is_primary_key = 1
                ) THEN 1 ELSE 0 END AS IsPrimaryKey,
                CASE WHEN EXISTS (
                    SELECT 1 
                    FROM sys.foreign_key_columns fkc 
                    WHERE fkc.parent_object_id = c.object_id AND fkc.parent_column_id = c.column_id
                ) THEN 1 ELSE 0 END AS IsForeignKey
            FROM 
                sys.tables t
            INNER JOIN 
                sys.columns c ON t.object_id = c.object_id
            INNER JOIN 
                sys.types ty ON c.user_type_id = ty.user_type_id
            ORDER BY 
                t.name, c.column_id
        """)
        
        tables = {}
        for row in cursor.fetchall():
            table_name = row.TableName
            if table_name not in tables:
                tables[table_name] = []
            
            tables[table_name].append({
                'name': row.ColumnName,
                'type': row.TypeName,
                'nullable': row.is_nullable,
                'is_primary_key': row.IsPrimaryKey,
                'is_foreign_key': row.IsForeignKey
            })
        
        # Obtener información de relaciones
        cursor.execute("""
            SELECT 
                fk.name AS FK_Name,
                tp.name AS ParentTable,
                tr.name AS RefTable,
                cp.name AS ParentColumn,
                cr.name AS RefColumn
            FROM 
                sys.foreign_keys fk
            INNER JOIN 
                sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
            INNER JOIN 
                sys.tables tp ON fk.parent_object_id = tp.object_id
            INNER JOIN 
                sys.tables tr ON fk.referenced_object_id = tr.object_id
            INNER JOIN 
                sys.columns cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
            INNER JOIN 
                sys.columns cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id
        """)
        
        relationships = []
        for row in cursor.fetchall():
            relationships.append({
                'name': row.FK_Name,
                'parent_table': row.ParentTable,
                'ref_table': row.RefTable,
                'parent_column': row.ParentColumn,
                'ref_column': row.RefColumn
            })
        
        # Generar diagrama según el tipo de visualización
        if visualization_type == 'mermaid':
            diagram = generate_mermaid_diagram(tables, relationships, show_cardinalities, show_attributes)
        else:
            diagram = generate_text_diagram(tables, relationships, show_cardinalities, show_attributes)
        
        return diagram, None
        
    except Exception as e:
        return None, str(e)

# Función para generar diagrama en formato Mermaid
def generate_mermaid_diagram(tables, relationships, show_cardinalities=True, show_attributes=True):
    diagram_lines = ["erDiagram"]
    
    # Agregar entidades
    for table_name, columns in tables.items():
        diagram_lines.append(f"    {table_name} {{")
        
        # Agregar atributos
        if show_attributes:
            pk_columns = [col for col in columns if col['is_primary_key']]
            other_columns = [col for col in columns if not col['is_primary_key']]
            
            for col in pk_columns:
                diagram_lines.append(f"        {col['type']} {col['name']} PK")
            
            for col in other_columns:
                fk_indicator = " FK" if col['is_foreign_key'] else ""
                nullable_indicator = " NULL" if col['nullable'] else ""
                diagram_lines.append(f"        {col['type']} {col['name']}{fk_indicator}{nullable_indicator}")
        
        diagram_lines.append("    }")
    
    # Agregar relaciones con cardinalidades mejoradas
    if show_cardinalities:
        for rel in relationships:
            # Determinar cardinalidad basada en la estructura de la BD
            # Esto es una simplificación - en una implementación real necesitarías analizar
            # las restricciones de nulabilidad y unicidad para determinar cardinalidades precisas
            diagram_lines.append(f"    {rel['parent_table']} ||--o{{ {rel['ref_table']} : \"{rel['name']}\"")
    
    return "\n".join(diagram_lines)

# Función para generar diagrama en formato texto
def generate_text_diagram(tables, relationships, show_cardinalities=True, show_attributes=True):
    diagram_lines = ["DIAGRAMA ENTIDAD-RELACIÓN (ER/EER)", "=" * 50, ""]
    
    # Agregar entidades
    for table_name, columns in tables.items():
        diagram_lines.append(f"ENTIDAD: {table_name}")
        diagram_lines.append("-" * 30)
        
        # Agregar atributos
        if show_attributes:
            pk_columns = [col for col in columns if col['is_primary_key']]
            other_columns = [col for col in columns if not col['is_primary_key']]
            
            if pk_columns:
                diagram_lines.append("  ATRIBUTOS CLAVE PRIMARIA:")
                for col in pk_columns:
                    diagram_lines.append(f"    * {col['name']} ({col['type']})")
            
            if other_columns:
                diagram_lines.append("  OTROS ATRIBUTOS:")
                for col in other_columns:
                    fk_indicator = " [FK]" if col['is_foreign_key'] else ""
                    nullable_indicator = " [NULL]" if col['nullable'] else ""
                    diagram_lines.append(f"    * {col['name']} ({col['type']}){fk_indicator}{nullable_indicator}")
        
        diagram_lines.append("")
    
    # Agregar relaciones
    if show_cardinalities and relationships:
        diagram_lines.append("RELACIONES:")
        diagram_lines.append("-" * 30)
        
        for rel in relationships:
            diagram_lines.append(f"* {rel['name']}: {rel['parent_table']}.{rel['parent_column']} -> {rel['ref_table']}.{rel['ref_column']}")
        
        diagram_lines.append("")
    
    return "\n".join(diagram_lines)

# Función para generar modelo relacional
def generate_relational_model(conn):
    try:
        cursor = conn.cursor()
        
        # Obtener información de tablas y columnas
        cursor.execute("""
            SELECT 
                t.name AS TableName,
                c.name AS ColumnName,
                ty.name AS TypeName,
                c.max_length,
                c.precision,
                c.scale,
                c.is_nullable,
                CASE WHEN EXISTS (
                    SELECT 1 
                    FROM sys.index_columns ic 
                    JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id 
                    WHERE ic.object_id = c.object_id AND ic.column_id = c.column_id AND i.is_primary_key = 1
                ) THEN 1 ELSE 0 END AS IsPrimaryKey,
                CASE WHEN EXISTS (
                    SELECT 1 
                    FROM sys.foreign_key_columns fkc 
                    WHERE fkc.parent_object_id = c.object_id AND fkc.parent_column_id = c.column_id
                ) THEN 1 ELSE 0 END AS IsForeignKey
            FROM 
                sys.tables t
            INNER JOIN 
                sys.columns c ON t.object_id = c.object_id
            INNER JOIN 
                sys.types ty ON c.user_type_id = ty.user_type_id
            ORDER BY 
                t.name, c.column_id
        """)
        
        tables = {}
        for row in cursor.fetchall():
            table_name = row.TableName
            if table_name not in tables:
                tables[table_name] = []
            
            # Formatear tipo de datos
            data_type = row.TypeName
            if data_type in ['varchar', 'nvarchar', 'char', 'nchar'] and row.max_length > 0:
                if row.max_length == -1:
                    data_type += '(MAX)'
                else:
                    data_type += f'({row.max_length})'
            elif data_type in ['decimal', 'numeric']:
                data_type += f'({row.precision}, {row.scale})'
            
            tables[table_name].append({
                'name': row.ColumnName,
                'type': data_type,
                'nullable': row.is_nullable,
                'is_primary_key': row.IsPrimaryKey,
                'is_foreign_key': row.IsForeignKey
            })
        
        # Obtener información de relaciones
        cursor.execute("""
            SELECT 
                fk.name AS FK_Name,
                tp.name AS ParentTable,
                tr.name AS RefTable,
                cp.name AS ParentColumn,
                cr.name AS RefColumn
            FROM 
                sys.foreign_keys fk
            INNER JOIN 
                sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
            INNER JOIN 
                sys.tables tp ON fk.parent_object_id = tp.object_id
            INNER JOIN 
                sys.tables tr ON fk.referenced_object_id = tr.object_id
            INNER JOIN 
                sys.columns cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
            INNER JOIN 
                sys.columns cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id
        """)
        
        relationships = []
        for row in cursor.fetchall():
            relationships.append({
                'name': row.FK_Name,
                'parent_table': row.ParentTable,
                'ref_table': row.RefTable,
                'parent_column': row.ParentColumn,
                'ref_column': row.RefColumn
            })
        
        # Generar modelo relacional
        diagram_lines = ["MODELO RELACIONAL", "=" * 50, ""]
        
        # Agregar tablas (relaciones)
        for table_name, columns in tables.items():
            diagram_lines.append(f"{table_name} (")
            
            # Agregar columnas (atributos)
            pk_columns = [col for col in columns if col['is_primary_key']]
            other_columns = [col for col in columns if not col['is_primary_key']]
            
            all_columns = pk_columns + other_columns
            for i, col in enumerate(all_columns):
                pk_indicator = " PK" if col['is_primary_key'] else ""
                fk_indicator = " FK" if col['is_foreign_key'] else ""
                nullable_indicator = " NULL" if col['nullable'] else " NOT NULL"
                
                line_end = "," if i < len(all_columns) - 1 else ""
                diagram_lines.append(f"    {col['name']} {col['type']}{pk_indicator}{fk_indicator}{nullable_indicator}{line_end}")
            
            diagram_lines.append(")")
            diagram_lines.append("")
        
        # Agregar claves foráneas
        if relationships:
            diagram_lines.append("CLAVES FORÁNEAS:")
            diagram_lines.append("-" * 30)
            
            for rel in relationships:
                diagram_lines.append(f"FOREIGN KEY ({rel['parent_column']}) REFERENCES {rel['ref_table']}({rel['ref_column']})")
            
            diagram_lines.append("")
        
        return "\n".join(diagram_lines), None
        
    except Exception as e:
        return None, str(e)

# Función para traducir SQL a Álgebra Relacional
def sql_to_ar(sql_query):
    try:
        # Análisis básico de consultas SQL (simplificado)
        sql_query = sql_query.strip().upper()
        
        # Patrones para diferentes tipos de consultas
        select_pattern = r'SELECT\s+(.*?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.*))?'
        join_pattern = r'SELECT\s+.*?\s+FROM\s+(\w+)\s+JOIN\s+(\w+)\s+ON\s+(.*)'
        
        # Verificar si es una consulta SELECT simple
        select_match = re.search(select_pattern, sql_query, re.IGNORECASE)
        if select_match:
            columns = select_match.group(1)
            table = select_match.group(2)
            condition = select_match.group(3) if select_match.group(3) else None
            
            # Construir expresión de álgebra relacional
            ar_expression = f"π {columns} "
            if condition:
                ar_expression += f"(σ {condition} ({table}))"
            else:
                ar_expression += f"({table})"
                
            return ar_expression, None
        
        # Verificar si es una consulta con JOIN
        join_match = re.search(join_pattern, sql_query, re.IGNORECASE)
        if join_match:
            table1 = join_match.group(1)
            table2 = join_match.group(2)
            join_condition = join_match.group(3)
            
            # Extraer columnas SELECT (simplificado)
            columns_match = re.search(r'SELECT\s+(.*?)\s+FROM', sql_query, re.IGNORECASE)
            columns = columns_match.group(1) if columns_match else "*"
            
            # Construir expresión de álgebra relacional
            ar_expression = f"π {columns} ({table1} ⨝ {table2})"
            return ar_expression, None
        
        return None, "Tipo de consulta SQL no soportado para traducción"
        
    except Exception as e:
        return None, str(e)

# Función para traducir Álgebra Relacional a SQL
def ar_to_sql(ar_expression):
    try:
        # Análisis básico de expresiones de álgebra relacional (simplificado)
        ar_expression = ar_expression.strip()
        
        # Patrones para diferentes operaciones
        projection_pattern = r'π\s+([^*].*?)\s+\((.*)\)'
        selection_pattern = r'σ\s+(.*?)\s+\((.*)\)'
        join_pattern = r'\((.*)\)\s+⨝\s+\((.*)\)'
        
        # Verificar si es una proyección
        projection_match = re.search(projection_pattern, ar_expression)
        if projection_match:
            columns = projection_match.group(1).strip()
            inner_expression = projection_match.group(2).strip()
            
            # Si la expresión interna es una selección
            selection_match = re.search(selection_pattern, inner_expression)
            if selection_match:
                condition = selection_match.group(1).strip()
                table = selection_match.group(2).strip()
                sql_query = f"SELECT {columns} FROM {table} WHERE {condition}"
                return sql_query, None
            else:
                # Es solo una tabla
                sql_query = f"SELECT {columns} FROM {inner_expression}"
                return sql_query, None
        
        # Verificar si es una selección
        selection_match = re.search(selection_pattern, ar_expression)
        if selection_match:
            condition = selection_match.group(1).strip()
            table = selection_match.group(2).strip()
            sql_query = f"SELECT * FROM {table} WHERE {condition}"
            return sql_query, None
        
        # Verificar si es un join
        join_match = re.search(join_pattern, ar_expression)
        if join_match:
            table1 = join_match.group(1).strip()
            table2 = join_match.group(2).strip()
            # Esto es simplificado - en la práctica necesitaríamos más información sobre la condición de join
            sql_query = f"SELECT * FROM {table1} JOIN {table2} ON ..."
            return sql_query, None
        
        # Si es solo un nombre de tabla
        if re.match(r'^\w+$', ar_expression):
            sql_query = f"SELECT * FROM {ar_expression}"
            return sql_query, None
        
        return None, "Expresión de álgebra relacional no soportada para traducción"
        
    except Exception as e:
        return None, str(e)

# Función para validar código Mermaid
def validate_mermaid_code(mermaid_code):
    try:
        # Validaciones básicas del código Mermaid
        lines = mermaid_code.split('\n')
        
        # Verificar que comience con la directiva correcta
        if not lines[0].strip().startswith('erDiagram'):
            # Intentar corregir automáticamente
            corrected_code = "erDiagram\n" + mermaid_code
            return {
                'success': True,
                'valid': False,
                'corrected_code': corrected_code,
                'message': 'Se agregó la directiva erDiagram faltante'
            }
        
        # Verificar sintaxis básica de entidades
        entity_count = 0
        for line in lines:
            if re.match(r'^\s*\w+\s*{', line):
                entity_count += 1
        
        if entity_count == 0:
            return {
                'success': False,
                'valid': False,
                'message': 'No se encontraron entidades en el diagrama'
            }
        
        return {
            'success': True,
            'valid': True,
            'message': 'Código Mermaid válido'
        }
        
    except Exception as e:
        return {
            'success': False,
            'valid': False,
            'message': f'Error validando código Mermaid: {str(e)}'
        }

# Rutas de la API
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/api/connect', methods=['POST'])
def api_connect():
    try:
        data = request.get_json()
        server = data.get('server', DEFAULT_SERVER)
        database = data.get('database', DEFAULT_DATABASE)
        username = data.get('username', DEFAULT_USERNAME)
        password = data.get('password', DEFAULT_PASSWORD)
        
        print(f"Intentando conectar a: {server}, BD: {database}, User: {username}")
        
        conn, error = connect_to_db(server, database, username, password)
        if error:
            print(f"Error de conexión: {error}")
            return jsonify({'success': False, 'message': error})
        
        conn.close()
        print("Conexión exitosa")
        return jsonify({'success': True, 'message': 'Conexión exitosa'})
        
    except Exception as e:
        print(f"Excepción en api_connect: {str(e)}")
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/getEntitiesAndRelationships', methods=['POST'])
def api_get_entities_and_relationships():
    try:
        data = request.get_json()
        server = data.get('server', DEFAULT_SERVER)
        database = data.get('database', DEFAULT_DATABASE)
        username = data.get('username', DEFAULT_USERNAME)
        password = data.get('password', DEFAULT_PASSWORD)
        
        print(f"Obteniendo info de: {server}, BD: {database}")
        
        conn, error = connect_to_db(server, database, username, password)
        if error:
            return jsonify({'success': False, 'message': error})
        
        info, error = get_database_info(conn)
        conn.close()
        
        if error:
            return jsonify({'success': False, 'message': error})
        
        return jsonify({'success': True, 'entities': info['entities'], 'relationships': info['relationships']})
        
    except Exception as e:
        print(f"Error en getEntitiesAndRelationships: {str(e)}")
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/generateEERDiagram', methods=['POST'])
def api_generate_eer_diagram():
    try:
        data = request.get_json()
        server = data.get('server', DEFAULT_SERVER)
        database = data.get('database', DEFAULT_DATABASE)
        username = data.get('username', DEFAULT_USERNAME)
        password = data.get('password', DEFAULT_PASSWORD)
        visualization_type = data.get('visualization_type', 'text')
        show_cardinalities = data.get('show_cardinalities', True)
        show_attributes = data.get('show_attributes', True)
        
        print(f"Generando diagrama EER para: {database}")
        
        conn, error = connect_to_db(server, database, username, password)
        if error:
            return jsonify({'success': False, 'message': error})
        
        diagram, error = generate_eer_diagram(conn, visualization_type, show_cardinalities, show_attributes)
        conn.close()
        
        if error:
            return jsonify({'success': False, 'message': error})
        
        return jsonify({'success': True, 'diagram': diagram})
        
    except Exception as e:
        print(f"Error en generateEERDiagram: {str(e)}")
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/generateRelationalModel', methods=['POST'])
def api_generate_relational_model():
    try:
        data = request.get_json()
        server = data.get('server', DEFAULT_SERVER)
        database = data.get('database', DEFAULT_DATABASE)
        username = data.get('username', DEFAULT_USERNAME)
        password = data.get('password', DEFAULT_PASSWORD)
        
        print(f"Generando modelo relacional para: {database}")
        
        conn, error = connect_to_db(server, database, username, password)
        if error:
            return jsonify({'success': False, 'message': error})
        
        diagram, error = generate_relational_model(conn)
        conn.close()
        
        if error:
            return jsonify({'success': False, 'message': error})
        
        return jsonify({'success': True, 'model': diagram})
        
    except Exception as e:
        print(f"Error en generateRelationalModel: {str(e)}")
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/translateSqlToAlgebra', methods=['POST'])
def api_sql_to_ar():
    try:
        data = request.get_json()
        sql_query = data.get('sql_query', '')
        
        print(f"Traduciendo SQL a AR: {sql_query[:50]}...")
        
        ar_expression, error = sql_to_ar(sql_query)
        if error:
            return jsonify({'success': False, 'message': error})
        
        return jsonify({'success': True, 'algebra_expression': ar_expression})
        
    except Exception as e:
        print(f"Error en translateSqlToAlgebra: {str(e)}")
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/translateAlgebraToSql', methods=['POST'])
def api_ar_to_sql():
    try:
        data = request.get_json()
        ar_expression = data.get('algebra_expression', '')
        
        print(f"Traduciendo AR a SQL: {ar_expression}")
        
        sql_query, error = ar_to_sql(ar_expression)
        if error:
            return jsonify({'success': False, 'message': error})
        
        return jsonify({'success': True, 'sql_query': sql_query})
        
    except Exception as e:
        print(f"Error en translateAlgebraToSql: {str(e)}")
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/validateMermaid', methods=['POST'])
def api_validate_mermaid():
    try:
        data = request.get_json()
        mermaid_code = data.get('mermaid_code', '')
        
        validation_result = validate_mermaid_code(mermaid_code)
        return jsonify(validation_result)
        
    except Exception as e:
        return jsonify({'success': False, 'valid': False, 'message': str(e)})

# Rutas de exportación (simuladas)
@app.route('/api/exportDiagram', methods=['POST'])
def api_export_diagram():
    try:
        # Simulación de exportación
        return jsonify({
            'success': True, 
            'message': 'Exportación simulada - En implementación real, se generaría un archivo',
            'file_url': '/api/download/sample.txt',
            'file_name': 'diagrama_exportado.txt'
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/exportRelationalModel', methods=['POST'])
def api_export_relational_model():
    try:
        # Simulación de exportación
        return jsonify({
            'success': True, 
            'message': 'Exportación simulada - En implementación real, se generaría un archivo',
            'file_url': '/api/download/sample.txt',
            'file_name': 'modelo_relacional.txt'
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/download/<filename>')
def download_file(filename):
    # Simulación de descarga
    return "Este es un archivo de ejemplo. En implementación real, se generaría el contenido dinámicamente."

if __name__ == '__main__':
    print("Iniciando servidor Flask en http://localhost:5000")
    print("Asegúrate de que SQL Server esté ejecutándose y la base de datos exista")
    app.run(debug=True, host='0.0.0.0', port=5000)

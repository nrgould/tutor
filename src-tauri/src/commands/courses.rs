use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use uuid::Uuid;

use crate::db;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Course {
    pub id: String,
    pub name: String,
    pub code: Option<String>,
    pub description: Option<String>,
    pub instructor: Option<String>,
    pub semester: Option<String>,
    pub color: String,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CourseMaterial {
    pub id: String,
    pub course_id: String,
    pub title: String,
    pub material_type: String,
    pub content: Option<String>,
    pub file_path: Option<String>,
    pub url: Option<String>,
    pub due_date: Option<String>,
    pub is_completed: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCourseInput {
    pub name: String,
    pub code: Option<String>,
    pub description: Option<String>,
    pub instructor: Option<String>,
    pub semester: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateMaterialInput {
    pub course_id: String,
    pub title: String,
    pub material_type: String,
    pub content: Option<String>,
    pub file_path: Option<String>,
    pub url: Option<String>,
    pub due_date: Option<String>,
}

#[tauri::command]
pub async fn create_course(
    app: AppHandle,
    input: CreateCourseInput,
) -> Result<Course, String> {
    let conn = db::get_connection(&app).map_err(|e| e.to_string())?;

    let course_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let color = input.color.unwrap_or_else(|| "#3b82f6".to_string());

    conn.execute(
        "INSERT INTO courses (id, name, code, description, instructor, semester, color, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            &course_id,
            &input.name,
            &input.code,
            &input.description,
            &input.instructor,
            &input.semester,
            &color,
            &now,
            &now,
        ],
    )
    .map_err(|e| format!("Failed to create course: {}", e))?;

    Ok(Course {
        id: course_id,
        name: input.name,
        code: input.code,
        description: input.description,
        instructor: input.instructor,
        semester: input.semester,
        color,
        is_active: true,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub async fn get_courses(
    app: AppHandle,
    active_only: Option<bool>,
) -> Result<Vec<Course>, String> {
    let conn = db::get_connection(&app).map_err(|e| e.to_string())?;
    let active_only = active_only.unwrap_or(true);

    let query = if active_only {
        "SELECT id, name, code, description, instructor, semester, color, is_active, created_at, updated_at FROM courses WHERE is_active = 1 ORDER BY name"
    } else {
        "SELECT id, name, code, description, instructor, semester, color, is_active, created_at, updated_at FROM courses ORDER BY is_active DESC, name"
    };

    let mut stmt = conn.prepare(query)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let courses = stmt
        .query_map([], |row| {
            Ok(Course {
                id: row.get(0)?,
                name: row.get(1)?,
                code: row.get(2)?,
                description: row.get(3)?,
                instructor: row.get(4)?,
                semester: row.get(5)?,
                color: row.get(6)?,
                is_active: row.get::<_, i32>(7)? != 0,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(|e| format!("Failed to query courses: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect courses: {}", e))?;

    Ok(courses)
}

#[tauri::command]
pub async fn get_course(
    app: AppHandle,
    course_id: String,
) -> Result<Course, String> {
    let conn = db::get_connection(&app).map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, name, code, description, instructor, semester, color, is_active, created_at, updated_at FROM courses WHERE id = ?1",
        [&course_id],
        |row| {
            Ok(Course {
                id: row.get(0)?,
                name: row.get(1)?,
                code: row.get(2)?,
                description: row.get(3)?,
                instructor: row.get(4)?,
                semester: row.get(5)?,
                color: row.get(6)?,
                is_active: row.get::<_, i32>(7)? != 0,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        },
    )
    .map_err(|e| format!("Failed to get course: {}", e))
}

#[tauri::command]
pub async fn update_course(
    app: AppHandle,
    course_id: String,
    name: Option<String>,
    code: Option<String>,
    description: Option<String>,
    instructor: Option<String>,
    semester: Option<String>,
    color: Option<String>,
    is_active: Option<bool>,
) -> Result<Course, String> {
    let conn = db::get_connection(&app).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let mut updates = vec!["updated_at = ?1".to_string()];
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(now.clone())];
    let mut param_idx = 2;

    if let Some(ref name) = name {
        updates.push(format!("name = ?{}", param_idx));
        params.push(Box::new(name.clone()));
        param_idx += 1;
    }
    if let Some(ref code) = code {
        updates.push(format!("code = ?{}", param_idx));
        params.push(Box::new(code.clone()));
        param_idx += 1;
    }
    if let Some(ref description) = description {
        updates.push(format!("description = ?{}", param_idx));
        params.push(Box::new(description.clone()));
        param_idx += 1;
    }
    if let Some(ref instructor) = instructor {
        updates.push(format!("instructor = ?{}", param_idx));
        params.push(Box::new(instructor.clone()));
        param_idx += 1;
    }
    if let Some(ref semester) = semester {
        updates.push(format!("semester = ?{}", param_idx));
        params.push(Box::new(semester.clone()));
        param_idx += 1;
    }
    if let Some(ref color) = color {
        updates.push(format!("color = ?{}", param_idx));
        params.push(Box::new(color.clone()));
        param_idx += 1;
    }
    if let Some(is_active) = is_active {
        updates.push(format!("is_active = ?{}", param_idx));
        params.push(Box::new(if is_active { 1i32 } else { 0i32 }));
        param_idx += 1;
    }

    let query = format!(
        "UPDATE courses SET {} WHERE id = ?{}",
        updates.join(", "),
        param_idx
    );
    params.push(Box::new(course_id.clone()));

    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    conn.execute(&query, param_refs.as_slice())
        .map_err(|e| format!("Failed to update course: {}", e))?;

    get_course(app, course_id).await
}

#[tauri::command]
pub async fn delete_course(
    app: AppHandle,
    course_id: String,
) -> Result<(), String> {
    let conn = db::get_connection(&app).map_err(|e| e.to_string())?;

    // Delete materials first
    conn.execute(
        "DELETE FROM course_materials WHERE course_id = ?1",
        [&course_id],
    )
    .map_err(|e| format!("Failed to delete materials: {}", e))?;

    // Delete course
    conn.execute(
        "DELETE FROM courses WHERE id = ?1",
        [&course_id],
    )
    .map_err(|e| format!("Failed to delete course: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn add_course_material(
    app: AppHandle,
    input: CreateMaterialInput,
) -> Result<CourseMaterial, String> {
    let conn = db::get_connection(&app).map_err(|e| e.to_string())?;

    let material_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    conn.execute(
        "INSERT INTO course_materials (id, course_id, title, type, content, file_path, url, due_date, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            &material_id,
            &input.course_id,
            &input.title,
            &input.material_type,
            &input.content,
            &input.file_path,
            &input.url,
            &input.due_date,
            &now,
        ],
    )
    .map_err(|e| format!("Failed to add material: {}", e))?;

    Ok(CourseMaterial {
        id: material_id,
        course_id: input.course_id,
        title: input.title,
        material_type: input.material_type,
        content: input.content,
        file_path: input.file_path,
        url: input.url,
        due_date: input.due_date,
        is_completed: false,
        created_at: now,
    })
}

#[tauri::command]
pub async fn get_course_materials(
    app: AppHandle,
    course_id: String,
    material_type: Option<String>,
) -> Result<Vec<CourseMaterial>, String> {
    let conn = db::get_connection(&app).map_err(|e| e.to_string())?;

    let query = if material_type.is_some() {
        "SELECT id, course_id, title, type, content, file_path, url, due_date, is_completed, created_at FROM course_materials WHERE course_id = ?1 AND type = ?2 ORDER BY due_date, created_at"
    } else {
        "SELECT id, course_id, title, type, content, file_path, url, due_date, is_completed, created_at FROM course_materials WHERE course_id = ?1 ORDER BY due_date, created_at"
    };

    let mut stmt = conn.prepare(query)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let materials = if let Some(ref mtype) = material_type {
        stmt.query_map([&course_id, mtype], |row| {
            Ok(CourseMaterial {
                id: row.get(0)?,
                course_id: row.get(1)?,
                title: row.get(2)?,
                material_type: row.get(3)?,
                content: row.get(4)?,
                file_path: row.get(5)?,
                url: row.get(6)?,
                due_date: row.get(7)?,
                is_completed: row.get::<_, i32>(8)? != 0,
                created_at: row.get(9)?,
            })
        })
        .map_err(|e| format!("Failed to query materials: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect materials: {}", e))?
    } else {
        stmt.query_map([&course_id], |row| {
            Ok(CourseMaterial {
                id: row.get(0)?,
                course_id: row.get(1)?,
                title: row.get(2)?,
                material_type: row.get(3)?,
                content: row.get(4)?,
                file_path: row.get(5)?,
                url: row.get(6)?,
                due_date: row.get(7)?,
                is_completed: row.get::<_, i32>(8)? != 0,
                created_at: row.get(9)?,
            })
        })
        .map_err(|e| format!("Failed to query materials: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect materials: {}", e))?
    };

    Ok(materials)
}

#[tauri::command]
pub async fn toggle_material_completed(
    app: AppHandle,
    material_id: String,
) -> Result<CourseMaterial, String> {
    let conn = db::get_connection(&app).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE course_materials SET is_completed = NOT is_completed WHERE id = ?1",
        [&material_id],
    )
    .map_err(|e| format!("Failed to toggle completion: {}", e))?;

    conn.query_row(
        "SELECT id, course_id, title, type, content, file_path, url, due_date, is_completed, created_at FROM course_materials WHERE id = ?1",
        [&material_id],
        |row| {
            Ok(CourseMaterial {
                id: row.get(0)?,
                course_id: row.get(1)?,
                title: row.get(2)?,
                material_type: row.get(3)?,
                content: row.get(4)?,
                file_path: row.get(5)?,
                url: row.get(6)?,
                due_date: row.get(7)?,
                is_completed: row.get::<_, i32>(8)? != 0,
                created_at: row.get(9)?,
            })
        },
    )
    .map_err(|e| format!("Failed to get material: {}", e))
}

#[tauri::command]
pub async fn delete_material(
    app: AppHandle,
    material_id: String,
) -> Result<(), String> {
    let conn = db::get_connection(&app).map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM course_materials WHERE id = ?1",
        [&material_id],
    )
    .map_err(|e| format!("Failed to delete material: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn get_upcoming_assignments(
    app: AppHandle,
    days: Option<i32>,
) -> Result<Vec<CourseMaterial>, String> {
    let conn = db::get_connection(&app).map_err(|e| e.to_string())?;
    let days = days.unwrap_or(7);

    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.course_id, m.title, m.type, m.content, m.file_path, m.url, m.due_date, m.is_completed, m.created_at
             FROM course_materials m
             JOIN courses c ON m.course_id = c.id
             WHERE m.due_date IS NOT NULL
               AND m.is_completed = 0
               AND c.is_active = 1
               AND date(m.due_date) <= date('now', '+' || ?1 || ' days')
             ORDER BY m.due_date",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let materials = stmt
        .query_map([days], |row| {
            Ok(CourseMaterial {
                id: row.get(0)?,
                course_id: row.get(1)?,
                title: row.get(2)?,
                material_type: row.get(3)?,
                content: row.get(4)?,
                file_path: row.get(5)?,
                url: row.get(6)?,
                due_date: row.get(7)?,
                is_completed: row.get::<_, i32>(8)? != 0,
                created_at: row.get(9)?,
            })
        })
        .map_err(|e| format!("Failed to query materials: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect materials: {}", e))?;

    Ok(materials)
}

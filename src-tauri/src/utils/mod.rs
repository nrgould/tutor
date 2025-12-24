// Utility functions for the Tutor app
// This module can be expanded as needed

pub fn generate_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

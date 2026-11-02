//! The macOS menu bar, the task context menu, the pull-down menus the page asks for, and the
//! handler they all share.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::Deserialize;
use tauri::menu::{Menu, MenuBuilder, MenuEvent, MenuItemBuilder};
use tauri::{AppHandle, Emitter, LogicalPosition, Manager, State, Window, WindowEvent, Wry};
use tauri_plugin_opener::OpenerExt;

/// The label of the main window.
pub const MAIN: &str = "main";

/// Where a chosen menu item is handled.
#[derive(Debug, PartialEq)]
pub enum Route {
    Settings,
    Docs,
    /// The focused window's page zoom changes.
    Zoom(ZoomStep),
    /// A `menu` event with the item id goes to this window.
    Window(String),
}

/// The zoom levels a window steps through.
const ZOOM_LEVELS: [f64; 12] = [0.5, 0.67, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];

/// The level a window starts at and Actual Size returns to.
const ZOOM_ACTUAL: f64 = 1.0;

/// What a View zoom item does to the focused window's zoom.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ZoomStep {
    Actual,
    In,
    Out,
}

/// The zoom level after `step`, given the window's `current` one.
pub fn zoom_after(current: f64, step: ZoomStep) -> f64 {
    match step {
        ZoomStep::Actual => ZOOM_ACTUAL,
        ZoomStep::In => ZOOM_LEVELS
            .iter()
            .copied()
            .find(|level| *level > current + 1e-9)
            .unwrap_or(ZOOM_LEVELS[ZOOM_LEVELS.len() - 1]),
        ZoomStep::Out => ZOOM_LEVELS
            .iter()
            .rev()
            .copied()
            .find(|level| *level < current - 1e-9)
            .unwrap_or(ZOOM_LEVELS[0]),
    }
}

/// The zoom level of each window that has been zoomed, by window label.
#[derive(Default)]
pub struct ZoomLevels(Mutex<HashMap<String, f64>>);

/// Applies `step` to the focused window's page zoom.
fn zoom_focused(app: &AppHandle, step: ZoomStep) {
    let Some(window) = app
        .webview_windows()
        .into_values()
        .find(|w| w.is_focused().unwrap_or(false))
    else {
        return;
    };
    let Some(levels) = app.try_state::<ZoomLevels>() else {
        return;
    };
    let mut levels = levels.0.lock().unwrap_or_else(|e| e.into_inner());
    let current = levels.get(window.label()).copied().unwrap_or(ZOOM_ACTUAL);
    let next = zoom_after(current, step);
    if window.set_zoom(next).is_ok() {
        levels.insert(window.label().to_string(), next);
    }
}

/// The page tskdeck's Help menu opens.
pub const DOCS_URL: &str = "https://gettsk.sh/docs/";

/// The event a window receives with the id of a chosen menu item.
pub const MENU_EVENT: &str = "menu";

/// The items that act on the selected task, in menu order: id and title. The Task menu and
/// the row context menu both list them.
pub const TASK_ITEMS: [(&str, &str); 8] = [
    ("task-open", "Open"),
    ("task-start", "Start"),
    ("task-ready", "Mark Ready"),
    ("task-done", "Mark Done"),
    ("task-block", "Block…"),
    ("task-review", "Request Review…"),
    ("task-assign", "Assign…"),
    ("task-archive", "Archive"),
];

/// The Group By choices: the value tsk takes and the title.
pub const GROUP_ITEMS: [(&str, &str); 4] = [
    ("none", "None"),
    ("project", "Project"),
    ("thread", "Thread"),
    ("assignee", "Assignee"),
];

/// The Sort By choices: the value tsk takes and the title.
pub const SORT_ITEMS: [(&str, &str); 5] = [
    ("recent", "Most Recent"),
    ("project", "Project"),
    ("thread", "Thread"),
    ("title", "Title"),
    ("assignee", "Assignee"),
];

/// Key equivalents the menu bar starts with, matching the keymap's macOS defaults. The page
/// reports the keymap's current ones with the menu state, so a rebound key shows here too.
pub const DEFAULT_ACCELERATORS: [(&str, &str); 11] = [
    ("settings", "Cmd+,"),
    ("new-task", "Cmd+N"),
    ("find", "Cmd+F"),
    ("sidebar", "Ctrl+Cmd+S"),
    ("done-drawer", "Shift+Cmd+D"),
    ("palette", "Cmd+K"),
    ("task-open", "Cmd+O"),
    ("task-start", "Cmd+L"),
    ("task-ready", "Cmd+Y"),
    ("task-done", "Cmd+D"),
    ("task-review", "Cmd+R"),
];

/// Ids of the items in a pull-down menu the task pane shows; they go to the main window.
pub const PULL_DOWN_PREFIX: &str = "pane-";

/// The pull-down item id that draws a separator line.
pub const PULL_DOWN_SEPARATOR: &str = "pane-separator";

const BOARD_ITEMS: [&str; 5] = ["new-task", "find", "sidebar", "done-drawer", "palette"];

pub fn group_id(key: &str) -> String {
    format!("group-{key}")
}

pub fn sort_id(key: &str) -> String {
    format!("sort-{key}")
}

/// The key equivalent an item starts with, if it has one.
pub fn default_accelerator(id: &str) -> Option<&'static str> {
    DEFAULT_ACCELERATORS
        .iter()
        .find(|(item, _)| *item == id)
        .map(|(_, keys)| *keys)
}

/// Group By and Sort By items, whose check marks follow the page.
fn is_choice(id: &str) -> bool {
    id.strip_prefix("group-")
        .is_some_and(|key| GROUP_ITEMS.iter().any(|(k, _)| *k == key))
        || id
            .strip_prefix("sort-")
            .is_some_and(|key| SORT_ITEMS.iter().any(|(k, _)| *k == key))
}

fn is_main_item(id: &str) -> bool {
    BOARD_ITEMS.contains(&id)
        || TASK_ITEMS.iter().any(|(item, _)| *item == id)
        || is_choice(id)
        || id.starts_with(PULL_DOWN_PREFIX)
}

/// Text editing items stay with the focused window. Board and task items go to the main
/// window, and do nothing while another window, such as Settings, has focus.
pub fn route(id: &str, focused: Option<&str>) -> Option<Route> {
    match id {
        "settings" => Some(Route::Settings),
        "docs" => Some(Route::Docs),
        "zoom-reset" => Some(Route::Zoom(ZoomStep::Actual)),
        "zoom-in" => Some(Route::Zoom(ZoomStep::In)),
        "zoom-out" => Some(Route::Zoom(ZoomStep::Out)),
        "undo" | "redo" => Some(Route::Window(focused.unwrap_or(MAIN).to_string())),
        _ if is_main_item(id) => match focused {
            Some(label) if label != MAIN => None,
            _ => Some(Route::Window(MAIN.to_string())),
        },
        _ => None,
    }
}

/// The main window's state that menu titles, check marks, key equivalents and enabled items
/// follow.
#[derive(Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MenuState {
    pub sidebar_visible: bool,
    pub drawer_open: bool,
    /// Whether the task items have a task to act on.
    pub task_selected: bool,
    pub group: String,
    pub sort: String,
    /// The Group By choices the current scope offers; the others are dimmed.
    pub groups: Vec<String>,
    /// The Sort By choices the current scope offers; the others are dimmed.
    pub sorts: Vec<String>,
    /// The name of the board change Undo reverses, such as "Archive".
    pub undo: Option<String>,
    /// Whether Undo has a board change to act on, named or not.
    pub can_undo: bool,
    /// Whether a text field in the main window has focus, where Undo and Redo act on typing.
    pub text_field: bool,
    /// Key equivalents by item id, from the keymap; `None` clears one.
    pub accelerators: HashMap<String, Option<String>>,
}

/// The last state the main window reported, applied again when focus moves between windows
/// and after a check item toggles itself.
#[derive(Default)]
pub struct MenuMemory(Mutex<Option<MenuState>>);

impl MenuMemory {
    fn remember(&self, state: MenuState) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(state);
    }

    /// The last reported state, if the main window has reported one.
    pub fn last(&self) -> Option<MenuState> {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
}

pub fn sidebar_title(visible: bool) -> &'static str {
    if visible {
        "Hide Sidebar"
    } else {
        "Show Sidebar"
    }
}

pub fn drawer_title(open: bool) -> &'static str {
    if open {
        "Hide Done Drawer"
    } else {
        "Show Done Drawer"
    }
}

/// Undo's title and whether it is enabled. While typing it undoes the typing; otherwise it
/// names the board change it reverses and is dimmed when there is none.
pub fn undo_item(change: Option<&str>, can_undo: bool, typing: bool) -> (String, bool) {
    if typing {
        return ("Undo".into(), true);
    }
    match change {
        Some(name) if can_undo => (format!("Undo {name}"), true),
        _ => ("Undo".into(), can_undo),
    }
}

/// Whether Redo is enabled: it redoes typing; board changes have no redo.
pub fn redo_enabled(typing: bool) -> bool {
    typing
}

/// The context menu shown over a board row; built once and kept so it outlives each popup.
pub struct TaskMenu(Menu<Wry>);

/// Builds the row context menu with the task items.
pub fn task_menu(app: &AppHandle) -> tauri::Result<TaskMenu> {
    let mut builder = MenuBuilder::new(app);
    for (i, (id, text)) in TASK_ITEMS.iter().enumerate() {
        // Separators split opening, the status changes and the remaining edits.
        if i == 1 || i == 6 {
            builder = builder.separator();
        }
        builder = builder.item(&MenuItemBuilder::with_id(*id, *text).build(app)?);
    }
    Ok(TaskMenu(builder.build()?))
}

/// Shows the task context menu at the pointer in the window that asked for it.
#[tauri::command]
pub async fn show_task_menu(window: Window, menu: State<'_, TaskMenu>) -> Result<(), String> {
    window.popup_menu(&menu.0).map_err(|e| e.to_string())
}

/// One item of a pull-down menu.
#[derive(Deserialize, Debug, Clone, PartialEq)]
pub struct PullDownItem {
    pub id: String,
    pub title: String,
}

/// The latest pull-down menu, kept so it outlives its popup.
#[derive(Default)]
pub struct PullDown(Mutex<Option<Menu<Wry>>>);

/// Shows a pull-down menu of `items` with its top-left corner at `x`, `y` in the window, in
/// logical pixels. Only items with the pull-down id prefix are shown; a chosen one arrives as a
/// `menu` event.
#[tauri::command]
pub async fn show_pull_down(
    window: Window,
    items: Vec<PullDownItem>,
    x: f64,
    y: f64,
    kept: State<'_, PullDown>,
) -> Result<(), String> {
    let app = window.app_handle();
    let mut builder = MenuBuilder::new(app);
    for item in items.iter().filter(|i| i.id.starts_with(PULL_DOWN_PREFIX)) {
        if item.id == PULL_DOWN_SEPARATOR {
            builder = builder.separator();
            continue;
        }
        let entry = MenuItemBuilder::with_id(item.id.as_str(), item.title.as_str())
            .build(app)
            .map_err(|e| e.to_string())?;
        builder = builder.item(&entry);
    }
    let menu = builder.build().map_err(|e| e.to_string())?;
    window
        .popup_menu_at(&menu, LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    *kept.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(menu);
    Ok(())
}

/// Whether a window other than the main one has focus, where Undo and Redo act on its fields.
#[cfg(target_os = "macos")]
fn elsewhere(app: &AppHandle) -> bool {
    app.webview_windows()
        .into_values()
        .any(|w| w.label() != MAIN && w.is_focused().unwrap_or(false))
}

/// Applies the last reported state to the menu bar. Without a menu bar it does nothing.
fn refresh(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    if let Some(state) = app.try_state::<MenuMemory>().and_then(|m| m.last()) {
        macos::apply(app, &state, elsewhere(app));
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

/// Updates the menu bar from the main window's state: the View titles, the Group By and Sort
/// By check marks, Undo, the key equivalents, and whether the Task items are enabled.
#[tauri::command]
pub fn menu_state(app: AppHandle, state: MenuState, memory: State<'_, MenuMemory>) {
    memory.remember(state);
    refresh(&app);
}

/// Undo and Redo follow the focused window, so focus moving between windows applies the
/// menu state again.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if matches!(event, WindowEvent::Focused(_)) {
        refresh(window.app_handle());
    }
}

/// Opens settings or the docs, or sends the item id to the window that handles it.
pub fn handle(app: &AppHandle, event: MenuEvent) {
    let focused = app
        .webview_windows()
        .into_values()
        .find(|w| w.is_focused().unwrap_or(false))
        .map(|w| w.label().to_string());
    let id = event.id().as_ref();
    match route(id, focused.as_deref()) {
        Some(Route::Settings) => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = crate::windows::open_settings(&app);
            });
        }
        Some(Route::Docs) => {
            let _ = app.opener().open_url(DOCS_URL, None::<&str>);
        }
        Some(Route::Zoom(step)) => zoom_focused(app, step),
        Some(Route::Window(label)) => {
            // A check item toggles its own mark when chosen; the page's choice sets it again.
            if is_choice(id) {
                refresh(app);
            }
            let _ = app.emit_to(label.as_str(), MENU_EVENT, id);
        }
        None => {}
    }
}

#[cfg(target_os = "macos")]
pub use macos::build;

#[cfg(target_os = "macos")]
mod macos {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use tauri::menu::{
        AboutMetadata, CheckMenuItem, CheckMenuItemBuilder, HELP_SUBMENU_ID, Menu, MenuBuilder,
        MenuItem, MenuItemBuilder, SubmenuBuilder, WINDOW_SUBMENU_ID,
    };
    use tauri::{AppHandle, Manager, Wry};

    use super::{
        GROUP_ITEMS, MenuState, SORT_ITEMS, TASK_ITEMS, default_accelerator, drawer_title,
        group_id, redo_enabled, sidebar_title, sort_id, undo_item,
    };

    /// The menu bar items whose title, check mark, key equivalent or enabled state follows the
    /// main window.
    struct LiveItems {
        sidebar: MenuItem<Wry>,
        drawer: MenuItem<Wry>,
        undo: MenuItem<Wry>,
        redo: MenuItem<Wry>,
        tasks: Vec<MenuItem<Wry>>,
        groups: Vec<(&'static str, CheckMenuItem<Wry>)>,
        sorts: Vec<(&'static str, CheckMenuItem<Wry>)>,
        /// Items whose key equivalent comes from the keymap, by id.
        keyed: HashMap<String, MenuItem<Wry>>,
        /// The key equivalents last set, so an unchanged one is left alone.
        accelerators: Mutex<HashMap<String, Option<String>>>,
    }

    fn item(
        app: &AppHandle,
        id: &str,
        text: &str,
        accelerator: Option<&str>,
    ) -> tauri::Result<MenuItem<Wry>> {
        let builder = MenuItemBuilder::with_id(id, text);
        match accelerator {
            Some(keys) => builder.accelerator(keys).build(app),
            None => builder.build(app),
        }
    }

    /// An item whose key equivalent the keymap sets.
    fn keyed(
        app: &AppHandle,
        keyed: &mut HashMap<String, MenuItem<Wry>>,
        id: &str,
        text: &str,
        enabled: bool,
    ) -> tauri::Result<MenuItem<Wry>> {
        let builder = MenuItemBuilder::with_id(id, text).enabled(enabled);
        let entry = match default_accelerator(id) {
            Some(keys) => builder.accelerator(keys).build(app)?,
            None => builder.build(app)?,
        };
        keyed.insert(id.to_string(), entry.clone());
        Ok(entry)
    }

    fn choices(
        app: &AppHandle,
        items: &[(&'static str, &str)],
        id_of: fn(&str) -> String,
    ) -> tauri::Result<Vec<(&'static str, CheckMenuItem<Wry>)>> {
        items
            .iter()
            .map(|(key, text)| {
                let entry = CheckMenuItemBuilder::with_id(id_of(key), *text)
                    .enabled(false)
                    .build(app)?;
                Ok((*key, entry))
            })
            .collect()
    }

    /// The app, File, Edit, View, Task, Window and Help menus.
    pub fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
        let package = app.package_info();
        // AppKit shows `version` as "Version x.y.z" and `short_version` as the build number in
        // parentheses after it; the empty build number keeps the version to one mention.
        let about = AboutMetadata {
            name: Some(package.name.clone()),
            version: Some(package.version.to_string()),
            short_version: Some(String::new()),
            copyright: Some("© 2026 Sérgio Santos".into()),
            credits: Some("A desktop client for the tsk task board.".into()),
            ..Default::default()
        };
        let mut keyed_items = HashMap::new();
        let app_menu = SubmenuBuilder::new(app, package.name.clone())
            .about(Some(about))
            .separator()
            .item(&keyed(app, &mut keyed_items, "settings", "Settings…", true)?)
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()?;
        let file = SubmenuBuilder::new(app, "File")
            .item(&keyed(app, &mut keyed_items, "new-task", "New Task", true)?)
            .separator()
            .close_window()
            .build()?;
        let undo = item(app, "undo", "Undo", Some("Cmd+Z"))?;
        let redo = item(app, "redo", "Redo", Some("Shift+Cmd+Z"))?;
        let edit = SubmenuBuilder::new(app, "Edit")
            .item(&undo)
            .item(&redo)
            .separator()
            .cut()
            .copy()
            .paste()
            .select_all()
            .separator()
            .item(&keyed(app, &mut keyed_items, "find", "Find…", true)?)
            .build()?;
        let sidebar = keyed(app, &mut keyed_items, "sidebar", sidebar_title(true), true)?;
        let drawer = keyed(app, &mut keyed_items, "done-drawer", drawer_title(false), true)?;
        let groups = choices(app, &GROUP_ITEMS, group_id)?;
        let sorts = choices(app, &SORT_ITEMS, sort_id)?;
        let mut group_by = SubmenuBuilder::new(app, "Group By");
        for (_, entry) in &groups {
            group_by = group_by.item(entry);
        }
        let mut sort_by = SubmenuBuilder::new(app, "Sort By");
        for (_, entry) in &sorts {
            sort_by = sort_by.item(entry);
        }
        let view = SubmenuBuilder::new(app, "View")
            .item(&sidebar)
            .item(&drawer)
            .separator()
            .item(&group_by.build()?)
            .item(&sort_by.build()?)
            .separator()
            .item(&keyed(app, &mut keyed_items, "palette", "Command Palette", true)?)
            .separator()
            .item(&item(app, "zoom-reset", "Actual Size", Some("Cmd+0"))?)
            .item(&item(app, "zoom-in", "Zoom In", Some("Cmd+="))?)
            .item(&item(app, "zoom-out", "Zoom Out", Some("Cmd+-"))?)
            .separator()
            .fullscreen()
            .build()?;
        let tasks = TASK_ITEMS
            .iter()
            .map(|(id, text)| keyed(app, &mut keyed_items, id, text, false))
            .collect::<tauri::Result<Vec<_>>>()?;
        let mut task = SubmenuBuilder::new(app, "Task");
        for (i, entry) in tasks.iter().enumerate() {
            if i == 1 || i == 6 {
                task = task.separator();
            }
            task = task.item(entry);
        }
        let task = task.build()?;
        let window = SubmenuBuilder::with_id(app, WINDOW_SUBMENU_ID, "Window")
            .minimize()
            .maximize()
            .separator()
            .bring_all_to_front()
            .build()?;
        let help = SubmenuBuilder::with_id(app, HELP_SUBMENU_ID, "Help")
            .item(&item(app, "docs", "tsk Documentation", None)?)
            .build()?;
        let accelerators = keyed_items
            .keys()
            .map(|id| (id.clone(), default_accelerator(id).map(String::from)))
            .collect();
        app.manage(LiveItems {
            sidebar,
            drawer,
            undo,
            redo,
            tasks,
            groups,
            sorts,
            keyed: keyed_items,
            accelerators: Mutex::new(accelerators),
        });
        MenuBuilder::new(app)
            .items(&[&app_menu, &file, &edit, &view, &task, &window, &help])
            .build()
    }

    /// Applies `state`; `elsewhere` is true while another window has focus, where Undo and
    /// Redo act on that window's fields.
    pub fn apply(app: &AppHandle, state: &MenuState, elsewhere: bool) {
        let Some(items) = app.try_state::<LiveItems>() else {
            return;
        };
        let typing = state.text_field || elsewhere;
        let _ = items.sidebar.set_text(sidebar_title(state.sidebar_visible));
        let _ = items.drawer.set_text(drawer_title(state.drawer_open));
        for task in &items.tasks {
            let _ = task.set_enabled(state.task_selected);
        }
        for (key, entry) in &items.groups {
            let _ = entry.set_checked(state.group == *key);
            let _ = entry.set_enabled(state.groups.iter().any(|g| g == key));
        }
        for (key, entry) in &items.sorts {
            let _ = entry.set_checked(state.sort == *key);
            let _ = entry.set_enabled(state.sorts.iter().any(|s| s == key));
        }
        let (title, enabled) = undo_item(state.undo.as_deref(), state.can_undo, typing);
        let _ = items.undo.set_text(title);
        let _ = items.undo.set_enabled(enabled);
        let _ = items.redo.set_enabled(redo_enabled(typing));
        let mut applied = items.accelerators.lock().unwrap_or_else(|e| e.into_inner());
        for (id, keys) in &state.accelerators {
            let Some(entry) = items.keyed.get(id) else {
                continue;
            };
            if applied.get(id) == Some(keys) {
                continue;
            }
            let _ = entry.set_accelerator(keys.as_deref());
            applied.insert(id.clone(), keys.clone());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_editing_items_stay_with_the_focused_window() {
        assert_eq!(
            route("undo", Some("settings")),
            Some(Route::Window("settings".into()))
        );
        assert_eq!(route("redo", Some(MAIN)), Some(Route::Window(MAIN.into())));
        assert_eq!(route("undo", None), Some(Route::Window(MAIN.into())));
    }

    fn board_and_task_ids() -> Vec<&'static str> {
        BOARD_ITEMS
            .iter()
            .copied()
            .chain(TASK_ITEMS.iter().map(|(id, _)| *id))
            .collect()
    }

    #[test]
    fn board_and_task_items_go_to_the_main_window() {
        for id in board_and_task_ids() {
            assert_eq!(
                route(id, Some(MAIN)),
                Some(Route::Window(MAIN.into())),
                "{id}"
            );
            assert_eq!(route(id, None), Some(Route::Window(MAIN.into())), "{id}");
        }
    }

    #[test]
    fn board_and_task_items_do_nothing_while_another_window_has_focus() {
        for id in board_and_task_ids() {
            assert_eq!(route(id, Some("settings")), None, "{id}");
        }
    }

    #[test]
    fn settings_and_docs_are_handled_here() {
        assert_eq!(route("settings", Some(MAIN)), Some(Route::Settings));
        assert_eq!(route("docs", None), Some(Route::Docs));
        assert_eq!(route("copy", Some(MAIN)), None);
    }

    #[test]
    fn zoom_items_are_handled_here() {
        for (id, step) in [
            ("zoom-reset", ZoomStep::Actual),
            ("zoom-in", ZoomStep::In),
            ("zoom-out", ZoomStep::Out),
        ] {
            assert_eq!(route(id, Some(MAIN)), Some(Route::Zoom(step)), "{id}");
            assert_eq!(route(id, Some("settings")), Some(Route::Zoom(step)), "{id}");
        }
    }

    #[test]
    fn zoom_steps_through_the_levels_and_stops_at_the_ends() {
        assert_eq!(zoom_after(1.0, ZoomStep::In), 1.1);
        assert_eq!(zoom_after(1.0, ZoomStep::Out), 0.9);
        assert_eq!(zoom_after(3.0, ZoomStep::In), 3.0);
        assert_eq!(zoom_after(0.5, ZoomStep::Out), 0.5);
        assert_eq!(zoom_after(2.5, ZoomStep::Actual), 1.0);
    }

    #[test]
    fn view_titles_name_what_the_item_does() {
        assert_eq!(sidebar_title(true), "Hide Sidebar");
        assert_eq!(sidebar_title(false), "Show Sidebar");
        assert_eq!(drawer_title(true), "Hide Done Drawer");
        assert_eq!(drawer_title(false), "Show Done Drawer");
    }

    #[test]
    fn menu_state_reads_the_page_payload() {
        let state: MenuState = serde_json::from_str(
            r#"{"sidebarVisible":false,"drawerOpen":true,"taskSelected":true,"group":"thread",
                "sort":"recent","groups":["none","thread"],"sorts":["recent","title"],
                "undo":"Archive","canUndo":true,"textField":false,
                "accelerators":{"task-done":"Cmd+D","task-open":null}}"#,
        )
        .unwrap();
        assert_eq!(
            state,
            MenuState {
                sidebar_visible: false,
                drawer_open: true,
                task_selected: true,
                group: "thread".into(),
                sort: "recent".into(),
                groups: vec!["none".into(), "thread".into()],
                sorts: vec!["recent".into(), "title".into()],
                undo: Some("Archive".into()),
                can_undo: true,
                text_field: false,
                accelerators: HashMap::from([
                    ("task-done".into(), Some("Cmd+D".into())),
                    ("task-open".into(), None),
                ]),
            }
        );
    }

    #[test]
    fn menu_state_fills_in_missing_fields() {
        let state: MenuState = serde_json::from_str(r#"{"taskSelected":true}"#).unwrap();
        assert!(state.task_selected);
        assert!(state.accelerators.is_empty());
        assert_eq!(state.undo, None);
    }

    #[test]
    fn group_sort_and_pull_down_items_go_to_the_main_window() {
        for id in ["group-none", "group-assignee", "sort-recent", "sort-title", "pane-block"] {
            assert_eq!(route(id, None), Some(Route::Window(MAIN.into())), "{id}");
            assert_eq!(route(id, Some("settings")), None, "{id}");
        }
        assert_eq!(route("group-bogus", None), None);
        assert_eq!(route("sort-", None), None);
    }

    #[test]
    fn undo_names_the_board_change_it_reverses() {
        assert_eq!(undo_item(Some("Archive"), true, false), ("Undo Archive".into(), true));
        assert_eq!(undo_item(None, false, false), ("Undo".into(), false));
        // A change that cannot be reversed leaves Undo enabled, so choosing it explains why.
        assert_eq!(undo_item(None, true, false), ("Undo".into(), true));
    }

    #[test]
    fn undo_and_redo_act_on_typing_in_a_text_field() {
        assert_eq!(undo_item(Some("Archive"), true, true), ("Undo".into(), true));
        assert_eq!(undo_item(None, false, true), ("Undo".into(), true));
        assert!(redo_enabled(true));
        assert!(!redo_enabled(false));
    }

    #[test]
    fn task_items_have_a_default_key_equivalent_except_block_assign_and_archive() {
        for (id, _) in TASK_ITEMS {
            let keyless = matches!(id, "task-block" | "task-assign" | "task-archive");
            assert_eq!(default_accelerator(id).is_none(), keyless, "{id}");
        }
    }

    #[test]
    fn default_key_equivalents_are_distinct() {
        let mut seen: Vec<&str> = DEFAULT_ACCELERATORS.iter().map(|(_, k)| *k).collect();
        seen.sort_unstable();
        seen.dedup();
        assert_eq!(seen.len(), DEFAULT_ACCELERATORS.len());
    }
}

//! Pure builders that turn typed inputs into `tsk` argv.
//!
//! Every option value uses the `--flag=value` form so values that start with
//! `-` stay values. Positional free text follows `--` after all flags.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Scope {
    Desk,
    All,
    Project { path: String },
    Thread { name: String },
    Assignee { name: String },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Shelf {
    Live,
    Done,
    Archived,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Group {
    None,
    Project,
    Thread,
    Assignee,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Sort {
    Recent,
    Project,
    Thread,
    Title,
    Assignee,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ListOptions {
    pub shelf: Shelf,
    pub group: Group,
    pub sort: Sort,
}

/// `project: None` captures to the desk.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CaptureInput {
    pub title: String,
    pub notes: Option<String>,
    pub project: Option<String>,
    pub thread: Option<String>,
    pub assignee: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StatusChange {
    Open,
    Ready,
    Start {
        dispatch: bool,
        again: bool,
        force: bool,
    },
    Done {
        clean: bool,
    },
    Blocked {
        why: Option<String>,
        needs: Option<String>,
        options: Vec<String>,
        on: Option<String>,
    },
    Review {
        done: Option<String>,
        checks: Vec<String>,
        next: Option<String>,
        on: Option<String>,
    },
}

/// `notes: Some("")` clears the notes, `unassign` clears the assignee and
/// `after: Some(vec![])` clears the task links. `unassign` is a separate flag
/// because serde cannot tell a missing `assignee` from `null`.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EditInput {
    pub title: Option<String>,
    pub notes: Option<String>,
    pub assignee: Option<String>,
    #[serde(default)]
    pub unassign: bool,
    pub after: Option<Vec<u64>>,
    pub on: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Place {
    Before { id: String },
    After { id: String },
    First,
    Last,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StepOp {
    Add { text: String, place: Option<Place> },
    Toggle { id: String },
    Rename { id: String, text: String },
    Move { id: String, place: Place },
    Remove { id: String },
}

pub fn list_args(scope: &Scope, options: &ListOptions) -> Vec<String> {
    let mut args = vec!["list".to_string()];
    match scope {
        Scope::Desk => args.push("--desk".into()),
        Scope::All => args.push("--all".into()),
        Scope::Project { path } => args.push(format!("--project={path}")),
        Scope::Thread { name } => {
            args.push("--all".into());
            args.push(format!("--thread={name}"));
        }
        Scope::Assignee { name } => {
            args.push("--all".into());
            args.push(format!("--assignee={name}"));
        }
    }
    match options.shelf {
        Shelf::Live => {}
        Shelf::Done => args.push("--done".into()),
        Shelf::Archived => args.push("--archived".into()),
    }
    // tsk refuses --group and --sort on the done and archived shelves.
    if options.shelf == Shelf::Live {
        push_group_and_sort(&mut args, options);
    }
    args.push("--json".into());
    args
}

fn push_group_and_sort(args: &mut Vec<String>, options: &ListOptions) {
    match options.group {
        Group::None => {}
        Group::Project => args.push("--group=project".into()),
        Group::Thread => args.push("--group=thread".into()),
        Group::Assignee => args.push("--group=assignee".into()),
    }
    match options.sort {
        Sort::Recent => {}
        Sort::Project => args.push("--sort=project".into()),
        Sort::Thread => args.push("--sort=thread".into()),
        Sort::Title => args.push("--sort=title".into()),
        Sort::Assignee => args.push("--sort=assignee".into()),
    }
}

pub fn task_args(number: u64) -> Vec<String> {
    vec!["list".into(), task(number), "--json".into()]
}

pub fn add_args(input: &CaptureInput) -> Vec<String> {
    let mut args = vec!["add".to_string(), format!("--title={}", input.title)];
    if let Some(notes) = &input.notes {
        args.push(format!("--notes={notes}"));
    }
    match &input.project {
        Some(path) => args.push(format!("--project={path}")),
        None => args.push("--desk".into()),
    }
    if let Some(thread) = &input.thread {
        args.push(format!("--thread={thread}"));
    }
    if let Some(assignee) = &input.assignee {
        args.push(format!("--assignee={assignee}"));
    }
    args.push("--json".into());
    args
}

pub fn status_args(number: u64, change: &StatusChange) -> Vec<String> {
    let mut args = vec!["status".to_string(), task(number)];
    match change {
        StatusChange::Open => args.push("open".into()),
        StatusChange::Ready => args.push("ready".into()),
        StatusChange::Start {
            dispatch,
            again,
            force,
        } => {
            args.push("started".into());
            if *again {
                args.push("--again".into());
            } else if !*dispatch {
                args.push("--no-dispatch".into());
            }
            if *force {
                args.push("--force".into());
            }
        }
        StatusChange::Done { clean } => {
            args.push("done".into());
            if *clean {
                args.push("--clean".into());
            }
        }
        StatusChange::Blocked {
            why,
            needs,
            options,
            on,
        } => {
            args.push("blocked".into());
            push_opt(&mut args, "why", why);
            push_opt(&mut args, "needs", needs);
            for option in options {
                args.push(format!("--option={option}"));
            }
            push_opt(&mut args, "on", on);
        }
        StatusChange::Review {
            done,
            checks,
            next,
            on,
        } => {
            args.push("review".into());
            push_opt(&mut args, "done", done);
            for check in checks {
                args.push(format!("--check={check}"));
            }
            push_opt(&mut args, "next", next);
            push_opt(&mut args, "on", on);
        }
    }
    args
}

pub fn edit_args(number: u64, input: &EditInput) -> Vec<String> {
    let mut args = vec!["edit".to_string(), task(number)];
    push_opt(&mut args, "title", &input.title);
    push_opt(&mut args, "notes", &input.notes);
    if input.unassign {
        args.push("--unassign".into());
    } else {
        push_opt(&mut args, "assignee", &input.assignee);
    }
    if let Some(after) = &input.after {
        if after.is_empty() {
            args.push("--clear-after".into());
        }
        for n in after {
            args.push(format!("--after={}", task(*n)));
        }
    }
    push_opt(&mut args, "on", &input.on);
    args
}

pub fn steps_args(number: u64, op: &StepOp) -> Vec<String> {
    let mut args = vec!["steps".to_string(), task(number)];
    match op {
        StepOp::Add { text, place } => {
            args.push("add".into());
            if let Some(place) = place {
                args.push(place_flag(place));
            }
            args.push("--".into());
            args.push(text.clone());
        }
        StepOp::Toggle { id } => {
            args.push("toggle".into());
            args.push(id.clone());
        }
        StepOp::Rename { id, text } => {
            args.push("rename".into());
            args.push(id.clone());
            args.push("--".into());
            args.push(text.clone());
        }
        StepOp::Move { id, place } => {
            args.push("move".into());
            args.push(id.clone());
            args.push(place_flag(place));
        }
        StepOp::Remove { id } => {
            args.push("remove".into());
            args.push(id.clone());
        }
    }
    args
}

pub fn reply_args(number: u64, text: &str, send: bool) -> Vec<String> {
    let mut args = vec!["reply".to_string(), task(number)];
    if send {
        args.push("--send".into());
    }
    args.push("--".into());
    args.push(text.to_string());
    args
}

pub fn archive_args(number: u64, archived: bool) -> Vec<String> {
    let command = if archived { "archive" } else { "unarchive" };
    vec![command.into(), task(number)]
}

fn task(number: u64) -> String {
    format!("T{number}")
}

fn push_opt(args: &mut Vec<String>, flag: &str, value: &Option<String>) {
    if let Some(value) = value {
        args.push(format!("--{flag}={value}"));
    }
}

fn place_flag(place: &Place) -> String {
    match place {
        Place::Before { id } => format!("--before={id}"),
        Place::After { id } => format!("--after={id}"),
        Place::First => "--first".into(),
        Place::Last => "--last".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    fn live() -> ListOptions {
        ListOptions {
            shelf: Shelf::Live,
            group: Group::None,
            sort: Sort::Recent,
        }
    }

    #[test]
    fn desk_scope() {
        assert_eq!(
            list_args(&Scope::Desk, &live()),
            s(&["list", "--desk", "--json"])
        );
    }

    #[test]
    fn project_scope_passes_full_path() {
        assert_eq!(
            list_args(
                &Scope::Project {
                    path: "/home/test/client/site".into()
                },
                &live()
            ),
            s(&["list", "--project=/home/test/client/site", "--json"])
        );
    }

    #[test]
    fn thread_scope_spans_all() {
        assert_eq!(
            list_args(
                &Scope::Thread {
                    name: "release".into()
                },
                &live()
            ),
            s(&["list", "--all", "--thread=release", "--json"])
        );
    }

    #[test]
    fn assignee_scope_spans_all() {
        assert_eq!(
            list_args(&Scope::Assignee { name: "me".into() }, &live()),
            s(&["list", "--all", "--assignee=me", "--json"])
        );
    }

    #[test]
    fn done_shelf_with_group_and_sort() {
        let o = ListOptions {
            shelf: Shelf::Done,
            group: Group::Thread,
            sort: Sort::Title,
        };
        assert_eq!(
            list_args(&Scope::All, &o),
            s(&["list", "--all", "--done", "--json"])
        );
    }

    #[test]
    fn archived_shelf_drops_group_and_sort() {
        let o = ListOptions {
            shelf: Shelf::Archived,
            group: Group::Project,
            sort: Sort::Assignee,
        };
        assert_eq!(
            list_args(&Scope::Desk, &o),
            s(&["list", "--desk", "--archived", "--json"])
        );
    }

    #[test]
    fn task_detail() {
        assert_eq!(task_args(12), s(&["list", "T12", "--json"]));
    }

    #[test]
    fn add_with_all_fields() {
        let c = CaptureInput {
            title: "Fix it".into(),
            notes: Some("details".into()),
            project: Some("/home/test/site".into()),
            thread: Some("auth".into()),
            assignee: Some("me".into()),
        };
        assert_eq!(
            add_args(&c),
            s(&[
                "add",
                "--title=Fix it",
                "--notes=details",
                "--project=/home/test/site",
                "--thread=auth",
                "--assignee=me",
                "--json"
            ])
        );
    }

    #[test]
    fn dash_values_use_equals_form() {
        let c = CaptureInput {
            title: "-5 degrees".into(),
            notes: None,
            project: None,
            thread: None,
            assignee: None,
        };
        assert_eq!(
            add_args(&c),
            s(&["add", "--title=-5 degrees", "--desk", "--json"])
        );
    }

    #[test]
    fn dash_positional_text_follows_double_dash() {
        assert_eq!(
            steps_args(
                3,
                &StepOp::Add {
                    text: "--force".into(),
                    place: Some(Place::First)
                }
            ),
            s(&["steps", "T3", "add", "--first", "--", "--force"])
        );
        assert_eq!(
            reply_args(3, "-1", true),
            s(&["reply", "T3", "--send", "--", "-1"])
        );
    }

    #[test]
    fn step_ops() {
        assert_eq!(
            steps_args(3, &StepOp::Toggle { id: "a3".into() }),
            s(&["steps", "T3", "toggle", "a3"])
        );
        assert_eq!(
            steps_args(
                3,
                &StepOp::Rename {
                    id: "a3".into(),
                    text: "New".into()
                }
            ),
            s(&["steps", "T3", "rename", "a3", "--", "New"])
        );
        assert_eq!(
            steps_args(
                3,
                &StepOp::Move {
                    id: "a3".into(),
                    place: Place::Before { id: "b1".into() }
                }
            ),
            s(&["steps", "T3", "move", "a3", "--before=b1"])
        );
        assert_eq!(
            steps_args(
                3,
                &StepOp::Add {
                    text: "Do".into(),
                    place: None
                }
            ),
            s(&["steps", "T3", "add", "--", "Do"])
        );
        assert_eq!(
            steps_args(3, &StepOp::Remove { id: "a3".into() }),
            s(&["steps", "T3", "remove", "a3"])
        );
    }

    #[test]
    fn start_without_dispatch() {
        assert_eq!(
            status_args(
                4,
                &StatusChange::Start {
                    dispatch: false,
                    again: false,
                    force: false
                }
            ),
            s(&["status", "T4", "started", "--no-dispatch"])
        );
    }

    #[test]
    fn start_again_with_force() {
        assert_eq!(
            status_args(
                4,
                &StatusChange::Start {
                    dispatch: true,
                    again: true,
                    force: true
                }
            ),
            s(&["status", "T4", "started", "--again", "--force"])
        );
    }

    #[test]
    fn done_clean() {
        assert_eq!(
            status_args(4, &StatusChange::Done { clean: true }),
            s(&["status", "T4", "done", "--clean"])
        );
    }

    #[test]
    fn blocked_card() {
        let c = StatusChange::Blocked {
            why: Some("which db?".into()),
            needs: None,
            options: vec!["postgres".into(), "sqlite".into()],
            on: None,
        };
        assert_eq!(
            status_args(5, &c),
            s(&[
                "status",
                "T5",
                "blocked",
                "--why=which db?",
                "--option=postgres",
                "--option=sqlite"
            ])
        );
    }

    #[test]
    fn review_card() {
        let c = StatusChange::Review {
            done: Some("built".into()),
            checks: vec!["a".into(), "b".into()],
            next: Some("ship".into()),
            on: Some("T9".into()),
        };
        assert_eq!(
            status_args(5, &c),
            s(&[
                "status",
                "T5",
                "review",
                "--done=built",
                "--check=a",
                "--check=b",
                "--next=ship",
                "--on=T9"
            ])
        );
    }

    #[test]
    fn edit_unassign_and_clear_after() {
        let e = EditInput {
            title: None,
            notes: Some(String::new()),
            assignee: None,
            unassign: true,
            after: Some(vec![]),
            on: None,
        };
        assert_eq!(
            edit_args(6, &e),
            s(&["edit", "T6", "--notes=", "--unassign", "--clear-after"])
        );
    }

    #[test]
    fn edit_after_list() {
        let e = EditInput {
            title: Some("New".into()),
            notes: None,
            assignee: Some("me".into()),
            unassign: false,
            after: Some(vec![2, 8]),
            on: None,
        };
        assert_eq!(
            edit_args(6, &e),
            s(&[
                "edit",
                "T6",
                "--title=New",
                "--assignee=me",
                "--after=T2",
                "--after=T8"
            ])
        );
    }

    #[test]
    fn archive_and_restore() {
        assert_eq!(archive_args(7, true), s(&["archive", "T7"]));
        assert_eq!(archive_args(7, false), s(&["unarchive", "T7"]));
    }

    #[test]
    fn list_options_use_plain_strings() {
        let o: ListOptions = serde_json::from_value(
            serde_json::json!({"shelf":"live","group":"none","sort":"recent"}),
        )
        .unwrap();
        assert_eq!(o, live());
        let archived = ListOptions {
            shelf: Shelf::Archived,
            ..live()
        };
        let v = serde_json::to_value(&archived).unwrap();
        assert_eq!(v["shelf"], "archived");
    }

    #[test]
    fn serde_shapes() {
        let scope: Scope = serde_json::from_str(r#"{"kind":"project","path":"/x"}"#).unwrap();
        assert_eq!(scope, Scope::Project { path: "/x".into() });
        let e: EditInput = serde_json::from_str(
            r#"{"title":null,"notes":null,"assignee":null,"after":null,"on":null}"#,
        )
        .unwrap();
        assert!(!e.unassign);
    }
}

//! Runs the real `tsk` against a throwaway store to pin the JSON shapes and
//! argument forms tskdeck depends on. Run with `-- --ignored`.

use std::ffi::OsString;
use std::path::Path;

use tskdeck_lib::tsk::args::*;
use tskdeck_lib::tsk::locate::{default_candidates, locate};
use tskdeck_lib::tsk::model::*;
use tskdeck_lib::tsk::runner::Tsk;

fn tsk_for(store: &Path) -> Tsk {
    let home = dirs::home_dir();
    let candidates = default_candidates(home.as_deref(), None);
    let path = std::env::var_os("PATH");
    let bin = locate(None, path.as_deref(), &candidates).expect("tsk is installed");
    Tsk {
        bin,
        env: vec![(
            OsString::from("TSK_STATE_DIR"),
            store.as_os_str().to_owned(),
        )],
    }
}

fn capture(title: &str) -> CaptureInput {
    CaptureInput {
        title: title.into(),
        notes: None,
        project: None,
        thread: None,
        assignee: None,
    }
}

fn live() -> ListOptions {
    ListOptions {
        shelf: Shelf::Live,
        group: Group::None,
        sort: Sort::Recent,
    }
}

fn detail(tsk: &Tsk, number: u64) -> TaskDetail {
    // `tsk list T<n> --json` wraps the single task in an array.
    let mut details: Vec<TaskDetail> = tsk.json(&task_args(number)).expect("task detail parses");
    assert_eq!(details.len(), 1);
    details.remove(0)
}

#[test]
#[ignore]
fn contract_with_real_tsk() {
    let store = tempfile::tempdir().unwrap();
    let tsk = tsk_for(store.path());

    // 1. add with a dash-leading title
    let added: AddResult = tsk.json(&add_args(&capture("-5 degrees"))).unwrap();
    assert_eq!(added.outcome, "created");
    let n = added.number;
    assert_eq!(detail(&tsk, n).row.title, "-5 degrees");

    // 2. dash-leading step text
    tsk.run(&steps_args(
        n,
        &StepOp::Add {
            text: "--force".into(),
            place: None,
        },
    ))
    .unwrap();
    assert!(detail(&tsk, n).steps.iter().any(|s| s.text == "--force"));

    // 3. start, then block with a dash-leading option
    tsk.run(&status_args(
        n,
        &StatusChange::Start {
            dispatch: false,
            again: false,
            force: false,
        },
    ))
    .unwrap();
    tsk.run(&status_args(
        n,
        &StatusChange::Blocked {
            why: Some("which db?".into()),
            needs: None,
            options: vec!["postgres".into(), "-sqlite".into()],
            on: None,
        },
    ))
    .unwrap();
    let block = detail(&tsk, n).row.block.expect("block present");
    assert_eq!(block.options, vec!["postgres", "-sqlite"]);
    assert_eq!(block.on, "you");

    // 4. list carries the block
    let rows: Vec<TaskRow> = tsk.json(&list_args(&Scope::All, &live())).unwrap();
    let row = rows.iter().find(|r| r.number == n).expect("row listed");
    assert!(row.block.is_some());

    // 5. reply, then ready: the answered block moves to past_blocks
    tsk.run(&reply_args(n, "-1", false)).unwrap();
    tsk.run(&status_args(n, &StatusChange::Ready)).unwrap();
    let d = detail(&tsk, n);
    assert_eq!(d.past_blocks[0].replies[0].text, "-1");

    // 6. review with checks
    tsk.run(&status_args(
        n,
        &StatusChange::Review {
            done: Some("done".into()),
            checks: vec!["a".into(), "b".into()],
            next: None,
            on: None,
        },
    ))
    .unwrap();
    let review = detail(&tsk, n).row.review.expect("review present");
    assert_eq!(review.round, 1);
    assert_eq!(review.checks.len(), 2);
    assert!(review.checks.iter().all(|c| c.state == CheckState::Open));

    // 7. retarget the review at another task
    let second: AddResult = tsk.json(&add_args(&capture("second task"))).unwrap();
    tsk.run(&edit_args(
        n,
        &EditInput {
            title: None,
            notes: None,
            assignee: None,
            unassign: false,
            after: None,
            on: Some(format!("T{}", second.number)),
        },
    ))
    .unwrap();
    let review = detail(&tsk, n).row.review.expect("review present");
    assert_eq!(review.on, format!("other:T{}", second.number));

    // Reviews store `on` as the given text (`other:...`); blocks resolve a task
    // to `task:<n>`.
    tsk.run(&status_args(
        second.number,
        &StatusChange::Blocked {
            why: Some("waiting on first".into()),
            needs: None,
            options: vec![],
            on: Some(format!("T{n}")),
        },
    ))
    .unwrap();
    let block = detail(&tsk, second.number)
        .row
        .block
        .expect("block present");
    assert_eq!(block.on, format!("task:{n}"));

    // 8. archive
    tsk.run(&archive_args(n, true)).unwrap();
    let archived: Vec<TaskRow> = tsk
        .json(&list_args(
            &Scope::All,
            &ListOptions {
                shelf: Shelf::Archived,
                group: Group::None,
                sort: Sort::Recent,
            },
        ))
        .unwrap();
    let row = archived
        .iter()
        .find(|r| r.number == n)
        .expect("archived row");
    assert!(row.archived.is_some());
}

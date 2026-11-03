use serde::{Deserialize, Serialize};

/// `[seconds, nanos]` since the Unix epoch.
pub type Timestamp = (u64, u32);

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Open,
    Ready,
    Started,
    Blocked,
    Review,
    Done,
    /// A status a newer `tsk` reports.
    #[serde(other)]
    Unknown,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CheckState {
    Open,
    Passed,
    Failed,
    /// A check state a newer `tsk` reports.
    #[serde(other)]
    Unknown,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AfterLink {
    pub task: u64,
    pub done: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Reply {
    pub at: Timestamp,
    pub by: String,
    pub text: String,
    #[serde(default)]
    pub edited: bool,
    #[serde(default)]
    pub sent: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Block {
    pub why: Option<String>,
    pub needs: Option<String>,
    #[serde(default)]
    pub options: Vec<String>,
    pub on: String,
    pub by: String,
    pub at: Timestamp,
    #[serde(default)]
    pub edited: bool,
    #[serde(default)]
    pub replies: Vec<Reply>,
    #[serde(default)]
    pub answered: bool,
    #[serde(default)]
    pub closed_at: Option<Timestamp>,
    #[serde(default)]
    pub closed_by: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Check {
    pub text: String,
    pub state: CheckState,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Review {
    #[serde(default)]
    pub round: u32,
    pub done: Option<String>,
    #[serde(default)]
    pub checks: Vec<Check>,
    pub next: Option<String>,
    pub on: String,
    pub by: String,
    pub at: Timestamp,
    #[serde(default)]
    pub edited: bool,
    #[serde(default)]
    pub feedback: Vec<Reply>,
    #[serde(default)]
    pub answered: bool,
    #[serde(default)]
    pub closed_at: Option<Timestamp>,
    #[serde(default)]
    pub closed_by: Option<String>,
    #[serde(default)]
    pub resolution: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct TaskRow {
    pub id: String,
    pub number: u64,
    pub title: String,
    pub status: Status,
    pub project: Option<String>,
    pub thread: Option<String>,
    pub assignee: Option<String>,
    pub assignee_kind: Option<String>,
    pub base: Option<String>,
    pub after: Vec<AfterLink>,
    pub before: Vec<u64>,
    #[serde(default)]
    pub archived: Option<String>,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub block: Option<Block>,
    #[serde(default)]
    pub review: Option<Review>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Step {
    pub id: String,
    pub done: bool,
    pub short_id: String,
    pub text: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Activity {
    pub at: Timestamp,
    pub by: Option<String>,
    pub kind: String,
    pub detail: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct TaskDetail {
    #[serde(flatten)]
    pub row: TaskRow,
    pub notes: Option<String>,
    pub steps: Vec<Step>,
    #[serde(default)]
    pub dispatch: Option<serde_json::Value>,
    #[serde(default)]
    pub past_blocks: Vec<Block>,
    #[serde(default)]
    pub past_reviews: Vec<Review>,
    pub activity: Vec<Activity>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AddResult {
    pub outcome: String,
    pub number: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_scope_rows() {
        let rows: Vec<TaskRow> =
            serde_json::from_str(include_str!("../../tests/fixtures/rows.json")).unwrap();
        assert_eq!(rows.len(), 4);
        assert_eq!(rows[0].project, None);
        assert_eq!(rows[3].block.as_ref().unwrap().on, "task:7");
    }

    #[test]
    fn parses_blocked_detail() {
        let d: Vec<TaskDetail> =
            serde_json::from_str(include_str!("../../tests/fixtures/detail-blocked.json")).unwrap();
        assert_eq!(d[0].row.status, Status::Blocked);
        assert_eq!(d[0].row.block.as_ref().unwrap().options.len(), 2);
        assert!(!d[0].steps[1].short_id.is_empty());
    }

    #[test]
    fn parses_review_checks() {
        let d: Vec<TaskDetail> =
            serde_json::from_str(include_str!("../../tests/fixtures/detail-review.json")).unwrap();
        let r = d[0].row.review.as_ref().unwrap();
        assert_eq!(
            r.checks.iter().map(|c| c.state.clone()).collect::<Vec<_>>(),
            vec![CheckState::Open, CheckState::Passed, CheckState::Failed]
        );
        assert_eq!(d[0].past_reviews.len(), 1);
    }

    #[test]
    fn an_unknown_status_and_check_state_parse_as_unknown() {
        let row: TaskRow = serde_json::from_str(
            r#"{"id":"x","number":1,"title":"T","status":"paused","project":null,"thread":null,
                "assignee":null,"assignee_kind":null,"base":null,"after":[],"before":[],
                "review":{"round":1,"done":null,"checks":[{"text":"c","state":"skipped"}],
                "next":null,"on":"human","by":"bot","at":[1,0],"edited":false,
                "feedback":[],"answered":false}}"#,
        )
        .unwrap();
        assert_eq!(row.status, Status::Unknown);
        assert_eq!(row.review.unwrap().checks[0].state, CheckState::Unknown);
        assert_eq!(
            serde_json::to_string(&Status::Unknown).unwrap(),
            r#""unknown""#
        );
    }

    #[test]
    fn a_block_and_review_without_optional_fields_parse() {
        let row: TaskRow = serde_json::from_str(
            r#"{"id":"x","number":1,"title":"T","status":"blocked","project":null,"thread":null,
                "assignee":null,"assignee_kind":null,"base":null,"after":[],"before":[],
                "block":{"on":"human","by":"bot","at":[1,0]}}"#,
        )
        .unwrap();
        let block = row.block.unwrap();
        assert!(block.options.is_empty() && block.replies.is_empty());
        assert!(!block.edited && !block.answered);

        let review: Review =
            serde_json::from_str(r#"{"on":"human","by":"bot","at":[1,0]}"#).unwrap();
        assert!(review.checks.is_empty() && review.feedback.is_empty());
        assert!(!review.edited && !review.answered);
        assert_eq!(review.round, 0);
    }

    #[test]
    fn rejects_missing_required_field() {
        assert!(serde_json::from_str::<TaskRow>(r#"{"id":"x","number":1}"#).is_err());
    }

    #[test]
    fn ignores_unknown_fields() {
        let mut v: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/fixtures/rows.json")).unwrap();
        v[0]["new_field"] = serde_json::json!(1);
        assert!(serde_json::from_value::<Vec<TaskRow>>(v).is_ok());
    }
}

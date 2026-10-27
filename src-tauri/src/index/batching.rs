use std::time::Duration;

pub const BATCH: usize = 25;
pub const MAX_BATCH_DELAY: Duration = Duration::from_secs(1);

pub fn should_commit(count: usize, elapsed: Duration) -> bool {
    count > 0 && (count >= BATCH || elapsed >= MAX_BATCH_DELAY)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn commits_full_or_waiting_nonempty_batches() {
        assert!(!should_commit(0, Duration::from_secs(2)));
        assert!(!should_commit(1, Duration::from_millis(100)));
        assert!(should_commit(1, Duration::from_secs(1)));
        assert!(should_commit(25, Duration::ZERO));
    }
}

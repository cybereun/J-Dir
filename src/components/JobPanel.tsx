import React from "react";
import { Loader2, X } from "lucide-react";
import { JobState } from "../types/jdir";
import { formatBytes } from "../utils/colorFilter";

interface JobPanelProps {
  jobs: JobState[];
  onCancel: (jobId: string) => void;
}

function percentOf(job: JobState): number | null {
  if (job.totalBytes > 0) {
    return Math.min(100, Math.round((job.doneBytes / job.totalBytes) * 100));
  }
  if (job.totalItems > 0) {
    return Math.min(100, Math.round((job.doneItems / job.totalItems) * 100));
  }
  return null;
}

export const JobPanel: React.FC<JobPanelProps> = ({ jobs, onCancel }) => {
  if (jobs.length === 0) return null;
  return (
    <div className="job-panel" role="status" aria-live="polite">
      {jobs.map((job) => {
        const pct = percentOf(job);
        return (
          <div key={job.id} className="job-card">
            <div className="job-card-top">
              <Loader2 size={13} className="spin-anim" />
              <span className="job-label">{job.label}</span>
              <button
                type="button"
                className="job-cancel-btn"
                disabled={job.cancelling}
                onClick={() => onCancel(job.id)}
                title="작업 취소"
              >
                <X size={12} />
                <span>{job.cancelling ? "취소 중..." : "취소"}</span>
              </button>
            </div>
            <div className="job-bar">
              <div
                className={`job-bar-fill ${pct === null ? "indeterminate" : ""}`}
                style={pct === null ? undefined : { width: `${pct}%` }}
              />
            </div>
            <div className="job-card-bottom">
              <span className="job-current" title={job.current}>
                {job.current || "준비 중..."}
              </span>
              <span className="job-stats">
                {job.totalBytes > 0
                  ? `${formatBytes(job.doneBytes)} / ${formatBytes(job.totalBytes)}`
                  : job.doneBytes > 0
                  ? formatBytes(job.doneBytes)
                  : ""}
                {job.totalItems > 0 && job.totalBytes === 0
                  ? ` ${job.doneItems}/${job.totalItems}개`
                  : job.doneItems > 0 && job.totalItems === 0
                  ? ` ${job.doneItems}개`
                  : ""}
                {pct !== null ? ` · ${pct}%` : ""}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

import React, { useState } from "react";
import { Music } from "lucide-react";
import { StreamedMedia } from "./StreamedMedia";

export const AudioView: React.FC<{ path: string; name: string }> = ({ path, name }) => {
  const [playing, setPlaying] = useState(false);
  return (
    <StreamedMedia
      path={path}
      unsupportedMessage="이 오디오 형식은 미리보기 재생을 지원하지 않습니다. 기본 프로그램으로 열어 주세요."
    >
      {(url, onError) => (
        <div className="audio-view">
          <div className={`audio-view-art ${playing ? "is-playing" : ""}`}>
            <Music size={40} />
          </div>
          <div className="audio-view-name">{name}</div>
          <audio
            key={url}
            controls
            preload="metadata"
            src={url}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onError={onError}
          />
        </div>
      )}
    </StreamedMedia>
  );
};

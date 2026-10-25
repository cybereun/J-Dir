import React from "react";
import { StreamedMedia } from "./StreamedMedia";

export const VideoView: React.FC<{ path: string; name: string }> = ({ path, name }) => (
  <StreamedMedia
    path={path}
    unsupportedMessage="이 동영상 형식/코덱은 미리보기 재생을 지원하지 않습니다. 기본 프로그램으로 열어 주세요."
  >
    {(url, onError) => (
      <div className="video-view">
        <video key={url} controls preload="metadata" src={url} onError={onError} title={name} />
      </div>
    )}
  </StreamedMedia>
);

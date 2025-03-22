import { WebSocket } from "@spacebar/gateway";

export interface WebRtcClient {
	websocket: WebSocket;
	channel_id: string;
	supportedCodecs: Codec[];
	supportedHeaders: RtpHeader[];
	audio_ssrc: number;
	video_ssrc: number;
	rtx_ssrc: number;
	sdpOffer: string;
}

export interface RtpHeader {
	uri: string;
	id: number;
}

export interface Codec {
	name: "opus" | "VP8" | "VP9" | "H264";
	type: "audio" | "video";
	priority: number;
	payload_type: number;
	rtx_payload_type?: number | null;
}

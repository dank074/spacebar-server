/*
	Spacebar: A FOSS re-implementation and extension of the Discord.com backend.
	Copyright (C) 2023 Spacebar and Spacebar Contributors
	
	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published
	by the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
	
	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU Affero General Public License for more details.
	
	You should have received a copy of the GNU Affero General Public License
	along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import { WebSocket } from "@spacebar/gateway";
import * as mediasoup from "mediasoup";
import { types as MediaSoupTypes } from "mediasoup";
import os from "os";
import * as SemanticSDP from "semantic-sdp";

const ifaces = os.networkInterfaces();

export function getLocalIp() {
	let localIp = "127.0.0.1";

	Object.keys(ifaces).forEach((ifname) => {
		for (const iface of ifaces[ifname]!) {
			// Ignore IPv6 and 127.0.0.1
			if (iface.family !== "IPv4" || iface.internal !== false) {
				continue;
			}

			// Set the local ip to the first IPv4 address found and exit the loop
			localIp = iface.address;
			return;
		}
	});

	return localIp;
}

interface RouterType {
	router: MediaSoupTypes.Router;
	worker: MediaSoupTypes.Worker<AppData>;
}

export const channels = new Map<string, Set<Client>>();
export const workers: MediaSoupTypes.Worker<AppData>[] = [];
export const routers = new Map<string, RouterType>();
export let nextWorkerIdx = 0;

export interface Client {
	transport?: MediaSoupTypes.WebRtcTransport;
	websocket: WebSocket;
	out: {
		stream?: Stream;
		tracks: Map<
			string,
			{
				audio_ssrc: number;
				video_ssrc: number;
				rtx_ssrc: number;
			}
		>;
	};
	in: {
		stream?: Stream;
		audio_ssrc: number;
		video_ssrc: number;
		rtx_ssrc: number;
	};
	sdpOffer: SemanticSDP.SDPInfo;
	channel_id: string;
	producers: {
		audio?: MediaSoupTypes.Producer;
		video?: MediaSoupTypes.Producer;
	};
	consumers: MediaSoupTypes.Consumer[];
	headerExtensions: MediaSoupTypes.RtpHeaderExtensionParameters[];
	supportedCodecs: MediaSoupTypes.RtpCodecCapability[];
}

export function getClients(channel_id: string) {
	if (!channels.has(channel_id)) channels.set(channel_id, new Set());
	return channels.get(channel_id)!;
}

export function getRouter(channelId: string) {
	return routers.get(channelId);
}

export async function getOrCreateRouter(channel_id: string) {
	if (!routers.has(channel_id)) {
		const worker = getNextWorker();
		const router = await worker.createRouter({
			mediaCodecs: MEDIA_CODECS,
		});

		const data = {
			router,
			worker,
		};
		routers.set(channel_id, data);
		return data;
	}

	return routers.get(channel_id)!;
}

export function getNextWorker() {
	const worker = workers[nextWorkerIdx];

	if (++nextWorkerIdx === workers.length) nextWorkerIdx = 0;

	return worker;
}

export async function createWorkers() {
	const numWorkers = 1;

	for (let i = 0; i < numWorkers; i++) {
		const worker = await mediasoup.createWorker({
			logLevel: "debug",
			logTags: [
				"info",
				"ice",
				"dtls",
				"rtp",
				"srtp",
				"rtcp",
				"rtx",
				"bwe",
				"score",
				"simulcast",
				"svc",
				"sctp",
			],
			rtcMinPort: 40000,
			rtcMaxPort: 49999,
		});

		worker.on("died", () => {
			console.error(
				"mediasoup Worker died, exiting  in 2 seconds... [pid:%d]",
				worker.pid,
			);

			setTimeout(() => process.exit(1), 2000);
		});

		workers.push(worker);

		// // Create a WebRtcServer in this Worker.
		// // Each mediasoup Worker will run its own WebRtcServer, so those cannot
		// // share the same listening ports.
		// const webRtcServerOptions: MediaSoupTypes.WebRtcServerOptions = {
		// 	listenInfos: [
		// 		{
		// 			protocol: "udp",
		// 			ip: "0.0.0.0",
		// 			announcedAddress: "192.168.10.112",
		// 			port: nextPort++,
		// 		},
		// 	],
		// };

		// const webRtcServer = await worker.createWebRtcServer(
		// 	webRtcServerOptions,
		// );

		// worker.appData.webRtcServer = webRtcServer;

		// Log worker resource usage every X seconds.
		// setInterval(async () => {
		// 	const usage = await worker.getResourceUsage();

		// 	console.debug(
		// 		"mediasoup Worker resource usage [pid:%d]: %o",
		// 		worker.pid,
		// 		usage,
		// 	);

		// 	const dump = await worker.dump();

		// 	console.debug(
		// 		"mediasoup Worker dump [pid:%d]: %o",
		// 		worker.pid,
		// 		dump,
		// 	);
		// }, 120000);
	}
}

export interface AppData extends MediaSoupTypes.AppData {
	webRtcServer?: MediaSoupTypes.WebRtcServer;
}

export interface Codec {
	name: "opus" | "VP8" | "VP9" | "H264";
	type: "audio" | "video";
	priority: number;
	payload_type: number;
	rtx_payload_type?: number | null;
}

export const MEDIA_CODECS: MediaSoupTypes.RtpCodecCapability[] = [
	{
		kind: "audio",
		mimeType: "audio/opus",
		clockRate: 48000,
		channels: 2,
		rtcpFeedback: [{ type: "nack" }, { type: "transport-cc" }],
		parameters: {
			minptime: 10,
			usedtx: 1,
			useinbandfec: 1,
		},
		preferredPayloadType: 111,
	},
	// {
	// 	kind: "audio",
	// 	mimeType: "audio/multiopus",
	// 	clockRate: 48000,
	// 	channels: 4,
	// 	// Quad channel.
	// 	parameters: {
	// 		channel_mapping: "0,1,2,3",
	// 		num_streams: 2,
	// 		coupled_streams: 2,
	// 	},
	// 	rtcpFeedback: [{ type: "nack" }, { type: "transport-cc" }],
	// },
	// {
	// 	kind: "audio",
	// 	mimeType: "audio/multiopus",
	// 	clockRate: 48000,
	// 	channels: 6,
	// 	// 5.1.
	// 	parameters: {
	// 		channel_mapping: "0,4,1,2,3,5",
	// 		num_streams: 4,
	// 		coupled_streams: 2,
	// 	},
	// 	rtcpFeedback: [{ type: "nack" }, { type: "transport-cc" }],
	// },
	// {
	// 	kind: "audio",
	// 	mimeType: "audio/multiopus",
	// 	clockRate: 48000,
	// 	channels: 8,
	// 	// 7.1.
	// 	parameters: {
	// 		channel_mapping: "0,6,1,2,3,4,5,7",
	// 		num_streams: 5,
	// 		coupled_streams: 3,
	// 	},
	// 	rtcpFeedback: [{ type: "nack" }, { type: "transport-cc" }],
	// },
	{
		kind: "video",
		mimeType: "video/VP8",
		clockRate: 90000,
		rtcpFeedback: [
			{ type: "nack" },
			{ type: "nack", parameter: "pli" },
			{ type: "ccm", parameter: "fir" },
			{ type: "goog-remb" },
			{ type: "transport-cc" },
		],
		preferredPayloadType: 96,
	},
	{
		kind: "video",
		mimeType: "video/VP9",
		clockRate: 90000,
		rtcpFeedback: [
			{ type: "nack" },
			{ type: "nack", parameter: "pli" },
			{ type: "ccm", parameter: "fir" },
			{ type: "goog-remb" },
			{ type: "transport-cc" },
		],
		preferredPayloadType: 98,
	},
	{
		kind: "video",
		mimeType: "video/H264",
		clockRate: 90000,
		parameters: {
			"level-asymmetry-allowed": 1,
			"packetization-mode": 1,
			"profile-level-id": "42e01f",
			"x-google-max-bitrate": 2500,
		},
		rtcpFeedback: [
			{ type: "nack" },
			{ type: "nack", parameter: "pli" },
			{ type: "ccm", parameter: "fir" },
			{ type: "goog-remb" },
			{ type: "transport-cc" },
		],
		preferredPayloadType: 102,
	},
	{
		kind: "video",
		mimeType: "video/H265",
		clockRate: 90000,
		parameters: {
			"level-asymmetry-allowed": 1,
		},
		rtcpFeedback: [
			{ type: "nack" },
			{ type: "nack", parameter: "pli" },
			{ type: "ccm", parameter: "fir" },
			{ type: "goog-remb" },
			{ type: "transport-cc" },
		],
		preferredPayloadType: 105,
	},
];

export interface Stream {
	type: string;
	rid: string; //number
	quality: number;
}

export const SUPPORTED_EXTENTIONS = [
	"urn:ietf:params:rtp-hdrext:sdes:mid",
	"urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id",
	"urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id",
	"http://tools.ietf.org/html/draft-ietf-avtext-framemarking-07",
	"urn:ietf:params:rtp-hdrext:framemarking",
	"urn:ietf:params:rtp-hdrext:ssrc-audio-level",
	"urn:3gpp:video-orientation",
	"urn:ietf:params:rtp-hdrext:toffset",
	"http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
	"http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time",
	"http://www.webrtc.org/experiments/rtp-hdrext/abs-capture-time",
	"http://www.webrtc.org/experiments/rtp-hdrext/playout-delay",
];

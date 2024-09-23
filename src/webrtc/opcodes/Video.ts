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

import { Payload, Send, WebSocket } from "@spacebar/gateway";
import { validateSchema, VoiceVideoSchema } from "@spacebar/util";
import { types as MediaSoupTypes } from "mediasoup";
import { getClients, getRouter, VoiceOPCodes } from "../util";

// request:
// {
// 	"audio_ssrc": 0,
// 	"rtx_ssrc": 197,
// 	"streams": [
// 		{
// 			"active": false,
// 			"max_bitrate": 2500000,
// 			"max_framerate": 30,
// 			"max_resolution": {
// 				"height": 720,
// 				"type": "fixed",
// 				"width": 1280
// 			},
// 			"quality": 100,
// 			"rid": "100",
// 			"rtx_ssrc": 197,
// 			"ssrc": 196,
// 			"type": "video"
// 		}
// 	],
// 	"video_ssrc": 196
// }

export async function onVideo(this: WebSocket, payload: Payload) {
	if (!this.client) return;
	const { channel_id } = this.client;
	const d = validateSchema("VoiceVideoSchema", payload.d) as VoiceVideoSchema;
	console.log(d);

	await Send(this, { op: VoiceOPCodes.MEDIA_SINK_WANTS, d: { any: 100 } });

	if (d.audio_ssrc === 0 && d.video_ssrc === 0) return;

	const router = getRouter(channel_id);
	if (!router) {
		console.error(`router not found`);
		return;
	}

	const transport = this.client.transport!;

	let audioProducer: MediaSoupTypes.Producer | undefined =
		this.client.producers.audio;

	let hasNewProducer = false;

	if (d.audio_ssrc !== 0) {
		if (!audioProducer) {
			hasNewProducer = true;
			audioProducer = await transport.produce({
				kind: "audio",
				rtpParameters: {
					codecs: [
						{
							payloadType:
								this.client.supportedCodecs.find(
									(val) => val.kind === "audio",
								)?.preferredPayloadType ?? 111,
							mimeType: "audio/opus",
							clockRate: 48000,
							channels: 2,
							rtcpFeedback: [
								// { type: "nack" },
								{ type: "transport-cc" },
							],
							parameters: {
								minptime: 10,
								usedtx: 1,
								useinbandfec: 1,
							},
						},
					],
					encodings: [
						{
							ssrc: d.audio_ssrc,
							maxBitrate: 64000,
							codecPayloadType:
								this.client.supportedCodecs.find(
									(val) => val.kind === "audio",
								)?.preferredPayloadType ?? 111,
						},
					],
					headerExtensions: [
						{
							id: 1,
							uri: "urn:ietf:params:rtp-hdrext:ssrc-audio-level",
						},
						{
							id: 3,
							uri: "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
						},
					],
				},
				paused: false,
			});

			await audioProducer.enableTraceEvent(["rtp"]);

			audioProducer.on("score", (score) => {
				console.debug(`audio producer score:`, score);
			});

			// audioProducer.on("trace", (trace) => {
			// 	console.debug(`audio producer trace:`, trace);
			// });

			this.client.producers.audio = audioProducer;
		}
	}

	let videoProducer: MediaSoupTypes.Producer | undefined =
		this.client.producers.video;

	const stream = d.streams?.find((element) => element !== undefined);

	if (d.video_ssrc !== 0 && stream?.active) {
		if (!videoProducer) {
			hasNewProducer = true;
			videoProducer = await transport.produce({
				kind: "video",
				rtpParameters: {
					codecs: [
						{
							payloadType:
								this.client.supportedCodecs.find(
									(val) => val.mimeType === "video/H264",
								)?.preferredPayloadType ?? 102,
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
						},
						{
							payloadType:
								this.client.supportedCodecs.find(
									(val) => val.mimeType === "video/rtx",
								)?.preferredPayloadType ?? 103,
							mimeType: "video/rtx",
							clockRate: 90000,
							parameters: {
								apt:
									this.client.supportedCodecs.find(
										(val) => val.mimeType === "video/H264",
									)?.preferredPayloadType ?? 102,
							},
						},
					],
					encodings: [
						{
							ssrc: stream.ssrc,
							rtx: { ssrc: stream.rtx_ssrc! },
							scalabilityMode: "L1T1",
							//scaleResolutionDownBy: 1,
							maxBitrate: stream.max_bitrate,
							rid: stream.rid,
							codecPayloadType:
								this.client.supportedCodecs.find(
									(val) => val.kind === "video",
								)?.preferredPayloadType ?? 102,
						},
					],
					headerExtensions: [
						{
							id: 2,
							uri: "http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time",
						},
						{
							id: 3,
							uri: "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
						},
						{
							id: 5,
							uri: "http://www.webrtc.org/experiments/rtp-hdrext/playout-delay",
						},
						{
							id: 13,
							uri: "urn:3gpp:video-orientation",
						},
						{
							id: 14,
							uri: "urn:ietf:params:rtp-hdrext:toffset",
						},
					],
				},
				paused: false,
			});

			await videoProducer.enableTraceEvent(["rtp"]);

			videoProducer.on("score", (score) => {
				console.debug(`video producer score:`, score);
			});
		}
	}

	// loop the clients and add a consumer for each one
	const clients = getClients(channel_id);
	for (const client of clients) {
		if (client.websocket.user_id === this.user_id) continue;
		if (!client.transport) continue;
		if (!hasNewProducer) continue;

		let a = client.consumers.find(
			(x) => x.kind === "audio" && x.appData.user_id === this.user_id,
		);
		if (d.audio_ssrc !== 0 && !a) {
			//close the existing consumer if it exists
			const consumers = client.consumers.filter(
				(x) => x.kind === "audio" && x.appData.user_id === this.user_id,
			);
			await Promise.all(consumers.map((x) => x.close()));
			const consumer = await client.transport.consume({
				producerId: audioProducer?.id!,
				rtpCapabilities: {
					codecs: client.supportedCodecs,
					headerExtensions:
						router.router.rtpCapabilities.headerExtensions,
				},
				paused: false,
				appData: {
					user_id: this.user_id,
				},
			});
			consumer.enableTraceEvent(["rtp"]);

			// consumer.on("trace", (trace) => {
			// 	console.debug(`audio consumer trace:`, trace);
			// });
			consumer.on("score", (score) => {
				console.debug(
					`audio consumer(${client.websocket.user_id}/${d.audio_ssrc}) score:`,
					score,
				);
			});
			client.consumers.push(consumer);
			a = consumer;
		}

		let b = client.consumers.find(
			(x) => x.kind === "video" && x.appData.user_id === this.user_id,
		);
		if (d.video_ssrc !== 0 && stream?.active && !b) {
			// close the existing consumer if it exists
			const a = client.consumers.filter(
				(x) => x.kind === "video" && x.appData.user_id === this.user_id,
			);
			await Promise.all(a.map((x) => x.close()));
			const consumer = await client.transport.consume({
				producerId: videoProducer?.id!,
				rtpCapabilities: {
					codecs: client.supportedCodecs,
					headerExtensions:
						router.router.rtpCapabilities.headerExtensions,
				},
				paused: false,
				appData: {
					user_id: this.user_id,
				},
			});
			client.consumers.push(consumer);
			consumer.on("trace", (buff) => console.log(buff));
			b = consumer;
		}

		if (
			d.audio_ssrc !== 0 ||
			(d.video_ssrc !== 0 && stream?.active && hasNewProducer)
		) {
			Send(client.websocket, {
				op: VoiceOPCodes.VIDEO,
				d: {
					user_id: this.user_id,
					audio_ssrc:
						a?.rtpParameters?.encodings?.find(
							(y) => y !== undefined,
						)?.ssrc || 0,
					video_ssrc:
						b?.rtpParameters?.encodings?.find(
							(y) => y !== undefined,
						)?.ssrc || 0,
					rtx_ssrc:
						b?.rtpParameters?.encodings?.find(
							(y) => y !== undefined,
						)?.rtx?.ssrc || 0,
					streams: d.streams?.map((x) => ({
						...x,
						//active: true,
						ssrc:
							b?.rtpParameters?.encodings?.find(
								(y) => y !== undefined,
							)?.ssrc || 0,
						rtx_ssrc:
							b?.rtpParameters?.encodings?.find(
								(y) => y !== undefined,
							)?.rtx?.ssrc || 0,
					})),
				},
			});
		}
	}
}

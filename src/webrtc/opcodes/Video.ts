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

	const router = getRouter(channel_id);
	if (!router) {
		console.error(`router not found`);
		return;
	}

	let audioProducer: MediaSoupTypes.Producer | undefined =
		this.client.producers.audio;

	let videoProducer: MediaSoupTypes.Producer | undefined =
		this.client.producers.video;

	if (d.audio_ssrc === 0 && audioProducer) {
		// close any consumers associated with this producer
		const clients = getClients(channel_id);
		for (const client of clients) {
			const consumers = client.consumers.filter(
				(consumer) => consumer.producerId === audioProducer?.id,
			);
			consumers.forEach((consumer) => {
				consumer.close();
				const index = client.consumers.indexOf(consumer);
				client.consumers.splice(index, 1);
			});
		}
		// close the existing audio producer, if any
		audioProducer?.close();
		this.client.producers.audio = undefined;
	}
	if (d.video_ssrc === 0 && videoProducer) {
		// close any consumers associated with this producer
		const clients = getClients(channel_id);
		for (const client of clients) {
			const consumers = client.consumers.filter(
				(consumer) => consumer.producerId === videoProducer?.id,
			);
			consumers.forEach((consumer) => {
				consumer.close();
				const index = client.consumers.indexOf(consumer);
				client.consumers.splice(index, 1);
			});
		}
		// close the existing video producer, if any
		videoProducer?.close();
		this.client.producers.video = undefined;
	}

	//if (d.audio_ssrc === 0 && d.video_ssrc === 0) return;

	const transport = this.client.transport!;

	// create a new audio producer
	if (d.audio_ssrc !== 0 && !audioProducer) {
		// according to the client firefox only does {urn:ietf:params:rtp-hdrext:ssrc-audio-level} while chrome does both
		const audioExtensionHeaders = this.client.headerExtensions
			.filter((e) => e.kind === "audio")
			.filter(
				(header) =>
					header.uri ===
						"urn:ietf:params:rtp-hdrext:ssrc-audio-level" ||
					header.uri ===
						"http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
			);

		audioProducer = await transport.produce({
			kind: "audio",
			rtpParameters: {
				codecs: this.client.supportedCodecs
					.filter((codec) => codec.kind === "audio")
					.map((codec) => {
						return {
							...codec,
							payloadType: codec.preferredPayloadType!,
						};
					}),
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
				headerExtensions: audioExtensionHeaders.map((header) => {
					return { id: header.preferredId, uri: header.uri };
				}),
			},
			paused: false,
		});

		//await audioProducer.enableTraceEvent(["rtp"]);

		// audioProducer.on("score", (score) => {
		// 	console.debug(`audio producer score:`, score);
		// });

		// audioProducer.on("trace", (trace) => {
		// 	console.debug(`audio producer trace:`, trace);
		// });

		this.client.producers.audio = audioProducer;
	}

	const stream = d.streams?.find((element) => element !== undefined);

	// create a new video producer
	if (d.video_ssrc !== 0 && stream?.active && !videoProducer) {
		console.log("Starting new producer:", stream);

		//taken from the client
		const videoExtensionHeaders = this.client.headerExtensions
			.filter((e) => e.kind === "video")
			.filter(
				(e) =>
					"urn:ietf:params:rtp-hdrext:toffset" === e.uri ||
					"http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time" ===
						e.uri ||
					"urn:3gpp:video-orientation" === e.uri ||
					"http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01" ===
						e.uri ||
					"http://www.webrtc.org/experiments/rtp-hdrext/playout-delay" ===
						e.uri,
			);

		videoProducer = await transport.produce({
			kind: "video",
			rtpParameters: {
				codecs: this.client.supportedCodecs
					.filter((codec) => codec.kind === "video")
					.map((codec) => {
						return {
							...codec,
							payloadType: codec.preferredPayloadType!,
						};
					}),
				encodings: [
					{
						ssrc: stream.ssrc,
						rtx: { ssrc: stream.rtx_ssrc },
						scalabilityMode: "L1T1",
						scaleResolutionDownBy: 1,
						maxBitrate: stream.max_bitrate,
						rid: stream.rid,
						codecPayloadType:
							this.client.supportedCodecs.find(
								(val) => val.mimeType === "video/H264",
							)?.preferredPayloadType ?? 102,
						dtx: true,
					},
				],
				headerExtensions: videoExtensionHeaders.map((header) => {
					return { id: header.preferredId, uri: header.uri };
				}),
			},
			paused: false,
			keyFrameRequestDelay: 1000,
		});

		//await videoProducer.enableTraceEvent(["rtp"]);

		videoProducer.on("score", (score) => {
			console.debug(`video producer score:`, score);
		});

		this.client.producers.video = videoProducer;
	}

	// loop the clients and add a consumer for each one, if it doesnt exist
	const clients = getClients(channel_id);
	for (const client of clients) {
		if (client.websocket.user_id === this.user_id) continue;
		if (!client.transport) continue;
		//if (!hasNewProducer) continue;

		let audioConsumer = client.consumers.find(
			(x) => x.producerId === audioProducer?.id,
		);
		if (d.audio_ssrc !== 0 && !audioConsumer && audioProducer) {
			//close the existing consumer if it exists
			// const consumers = client.consumers.filter(
			// 	(x) => x.kind === "audio" && x.appData.user_id === this.user_id,
			// );
			// await Promise.all(consumers.map((x) => x.close()));
			const consumer = await client.transport.consume({
				producerId: audioProducer.id,
				rtpCapabilities: {
					codecs: client.supportedCodecs,
					headerExtensions: client.headerExtensions,
				},
				paused: false,
				appData: {
					user_id: this.user_id,
				},
			});
			//consumer.enableTraceEvent(["rtp"]);

			// consumer.on("trace", (trace) => {
			// 	console.debug(`audio consumer trace:`, trace);
			// });
			// consumer.on("score", (score) => {
			// 	console.debug(
			// 		`audio consumer(${client.websocket.user_id}/${d.audio_ssrc}) score:`,
			// 		score,
			// 	);
			// });
			client.consumers.push(consumer);
			const dump = await consumer.dump();
			console.log(dump);
			audioConsumer = consumer;
		}

		let videoConsumer = client.consumers.find(
			(x) => x.producerId === videoProducer?.id,
		);
		if (
			d.video_ssrc !== 0 &&
			stream?.active &&
			!videoConsumer &&
			videoProducer
		) {
			// close the existing consumer if it exists
			// const a = client.consumers.filter(
			// 	(x) => x.kind === "video" && x.appData.user_id === this.user_id,
			// );
			// await Promise.all(a.map((x) => x.close()));
			const consumer = await client.transport.consume({
				producerId: videoProducer.id,
				rtpCapabilities: {
					codecs: client.supportedCodecs,
					headerExtensions: client.headerExtensions,
				},
				paused: false,
				appData: {
					user_id: this.user_id,
				},
				preferredLayers: {
					spatialLayer: 0,
					temporalLayer: 0,
				},
				//mid: "2",
				ignoreDtx: true,
			});
			client.consumers.push(consumer);
			const dump = await consumer.dump();
			console.log(dump);
			console.log(dump.rtpParameters.codecs);
			console.log(dump.rtpParameters.encodings);
			//await consumer.enableTraceEvent(["keyframe"])
			//consumer.on("trace", (event) => console.log(event));
			// setInterval(async () => {
			// 	const stats = await consumer?.getStats()
			// 	console.log(stats)
			// }, 5000)
			videoConsumer = consumer;
		}

		await Send(client.websocket, {
			op: VoiceOPCodes.VIDEO,
			d: {
				user_id: this.user_id,
				audio_ssrc:
					audioConsumer?.rtpParameters?.encodings?.find(
						(y) => y !== undefined,
					)?.ssrc || 0,
				video_ssrc:
					videoConsumer?.rtpParameters?.encodings?.find(
						(y) => y !== undefined,
					)?.ssrc || 0,
				rtx_ssrc:
					videoConsumer?.rtpParameters?.encodings?.find(
						(y) => y !== undefined,
					)?.rtx?.ssrc || 0,
				streams: d.streams?.map((x) => ({
					...x,
					//active: true,
					ssrc:
						videoConsumer?.rtpParameters?.encodings?.find(
							(y) => y !== undefined,
						)?.ssrc || 0,
					rtx_ssrc:
						videoConsumer?.rtpParameters?.encodings?.find(
							(y) => y !== undefined,
						)?.rtx?.ssrc || 0,
				})),
			},
		});
	}
}

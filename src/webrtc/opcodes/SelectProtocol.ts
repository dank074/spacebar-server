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
import { SelectProtocolSchema, validateSchema } from "@spacebar/util";
import { types as MediaSoupTypes } from "mediasoup";
import * as sdpTransform from "sdp-transform";
import * as SemanticSDP from "semantic-sdp";
import { getRouter, SUPPORTED_EXTENTIONS, VoiceOPCodes } from "../util";
import { RtpCapabilities } from "mediasoup/node/lib/RtpParameters";

// request:
// {
// 	"codecs": [
// 		{
// 			"name": "opus",
// 			"payload_type": 109,
// 			"priority": 1000,
// 			"rtx_payload_type": null,
// 			"type": "audio"
// 		},
// 		{
// 			"name": "H264",
// 			"payload_type": 126,
// 			"priority": 1000,
// 			"rtx_payload_type": 127,
// 			"type": "video"
// 		},
// 		{
// 			"name": "VP8",
// 			"payload_type": 120,
// 			"priority": 2000,
// 			"rtx_payload_type": 124,
// 			"type": "video"
// 		},
// 		{
// 			"name": "VP9",
// 			"payload_type": 121,
// 			"priority": 3000,
// 			"rtx_payload_type": 125,
// 			"type": "video"
// 		}
// 	],
// 	"data": "a=fingerprint:sha-256 F1:31:51:8B:E9:C8:3F:33:61:41:5C:BA:7A:59:07:4A:DA:53:40:88:62:0B:DA:B0:4D:0C:58:9B:16:D8:9F:25\na=ice-options:trickle\na=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level\na=extmap:2/recvonly urn:ietf:params:rtp-hdrext:csrc-audio-level\na=extmap:3 urn:ietf:params:rtp-hdrext:sdes:mid\na=ice-pwd:5ac55fdfff3ac50fbb6c2852baea62bf\na=ice-ufrag:5e6e9e9c\na=rtpmap:109 opus/48000/2\na=extmap:4 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\na=extmap:5 urn:ietf:params:rtp-hdrext:toffset\na=extmap:6/recvonly http://www.webrtc.org/experiments/rtp-hdrext/playout-delay\na=extmap:7 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\na=rtpmap:120 VP8/90000\na=rtpmap:124 rtx/90000",
// 	"protocol": "webrtc",
// 	"rtc_connection_id": "70a69cc2-14d7-496e-ba4b-d16570a95ade",
// 	"sdp": "a=fingerprint:sha-256 F1:31:51:8B:E9:C8:3F:33:61:41:5C:BA:7A:59:07:4A:DA:53:40:88:62:0B:DA:B0:4D:0C:58:9B:16:D8:9F:25\na=ice-options:trickle\na=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level\na=extmap:2/recvonly urn:ietf:params:rtp-hdrext:csrc-audio-level\na=extmap:3 urn:ietf:params:rtp-hdrext:sdes:mid\na=ice-pwd:5ac55fdfff3ac50fbb6c2852baea62bf\na=ice-ufrag:5e6e9e9c\na=rtpmap:109 opus/48000/2\na=extmap:4 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\na=extmap:5 urn:ietf:params:rtp-hdrext:toffset\na=extmap:6/recvonly http://www.webrtc.org/experiments/rtp-hdrext/playout-delay\na=extmap:7 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\na=rtpmap:120 VP8/90000\na=rtpmap:124 rtx/90000"
// }

// response:
// {
//     "audio_codec": "opus",
//     "media_session_id": "40984f1105901745530fb81cfe5f5633",
//     "sdp": "m=audio 50021 ICE/SDP\na=fingerprint:sha-256 4A:79:94:16:44:3F:BD:05:41:5A:C7:20:F3:12:54:70:00:73:5D:33:00:2D:2C:80:9B:39:E1:9F:2D:A7:49:87\nc=IN IP4 66.22.206.164\na=rtcp:50021\na=ice-ufrag:iLG8\na=ice-pwd:qMfFrCD0PcC/TxyfQM9H7t\na=fingerprint:sha-256 4A:79:94:16:44:3F:BD:05:41:5A:C7:20:F3:12:54:70:00:73:5D:33:00:2D:2C:80:9B:39:E1:9F:2D:A7:49:87\na=candidate:1 1 UDP 4261412862 66.22.206.164 50021 typ host\n",
//     "video_codec": "H264"
// }

export async function onSelectProtocol(this: WebSocket, payload: Payload) {
	if (!this.client) return;

	const data = validateSchema(
		"SelectProtocolSchema",
		payload.d,
	) as SelectProtocolSchema;

	await Send(this, { op: VoiceOPCodes.MEDIA_SINK_WANTS, d: { any: 100 } });

	// get the router for the voice channel
	const router = getRouter(this.client.channel_id);
	if (!router) {
		console.error("Could not find router");
		this.close();
		return;
	}

	// const clientAudioCodecs = data
	// 	.codecs!.filter((x) => x.type === "audio")
	// 	.sort((a, b) => a.priority - b.priority);

	// const clientVideoCodecs = data
	// 	.codecs!.filter((x) => x.type === "video")
	// 	.sort((a, b) => a.priority - b.priority);

	// const serverAudioCodecs = router.router.rtpCapabilities.codecs!.filter(
	// 	(x) => x.kind === "audio",
	// );

	// const serverVideoCodecs = router.router.rtpCapabilities.codecs!.filter(
	// 	(x) => x.kind === "video",
	// );

	// const audioCodec = serverAudioCodecs.find((x) => {
	// 	return clientAudioCodecs.some(
	// 		(y) => y.name === x.mimeType.split("/")[1],
	// 	);
	// });

	// const videoCodec = serverVideoCodecs.find((x) => {
	// 	return clientVideoCodecs.some(
	// 		(y) => y.name === x.mimeType.split("/")[1],
	// 	);
	// });

	// if (!audioCodec || !videoCodec) {
	// 	console.error("Could not agree on a codec");
	// 	this.close();
	// 	return;
	// }

	const offer = SemanticSDP.SDPInfo.parse("m=audio\n" + data.sdp);
	const offer2 = sdpTransform.parse(data.sdp!);
	this.client.sdpOffer = offer;
	this.client.headerExtensions =
		offer2.ext
			?.filter((x) => SUPPORTED_EXTENTIONS.includes(x.uri))
			.map((x) => ({
				uri: x.uri as MediaSoupTypes.RtpHeaderExtensionUri,
				id: x.value,
				parameters: x.config,
				encrypt: false,
			})) ?? [];

	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	//@ts-ignore
	offer.getMedias()[0].type = "audio"; // this is bad, but answer.toString() fails otherwise
	console.log(offer.getMedias());
	//offer.getMedias()[0].setBitrate(64000);
	const remoteDTLS = offer.getDTLS().plain();

	await this.client.transport!.connect({
		dtlsParameters: {
			fingerprints: [
				{
					algorithm:
						remoteDTLS.hash as MediaSoupTypes.FingerprintAlgorithm,
					value: remoteDTLS.fingerprint,
				},
			],
			role: "client",
		},
	});

	console.debug("producer transport connected");

	const iceParameters = this.client.transport!.iceParameters;
	const iceCandidates = this.client.transport!.iceCandidates;
	const iceCandidate = iceCandidates[0];
	const dltsParamters = this.client.transport!.dtlsParameters;
	const fingerprint = dltsParamters.fingerprints.find(
		(x) => x.algorithm === "sha-256",
	)!;

	// const answer = offer.answer({
	// 	dtls: SemanticSDP.DTLSInfo.expand({
	// 		setup: "actpass",
	// 		hash: "sha-256",
	// 		fingerprint: `${fingerprint.algorithm} ${fingerprint.value}`,
	// 	}),
	// 	ice: SemanticSDP.ICEInfo.expand({
	// 		ufrag: iceParameters.usernameFragment,
	// 		pwd: iceParameters.password,
	// 		lite: iceParameters.iceLite,
	// 	}),
	// 	candidates: iceCandidates.map((x) =>
	// 		SemanticSDP.CandidateInfo.expand({
	// 			foundation: x.foundation,
	// 			transport: x.protocol,
	// 			priority: x.priority,
	// 			port: x.port,
	// 			type: x.type,
	// 			address: x.address,
	// 			componentId: 1,
	// 		}),
	// 	),
	// 	capabilities: {
	// 		audio: {
	// 			codecs: ["opus"],
	// 			rtx: true,
	// 			rtcpfbs: [{ id: "transport-cc" }],
	// 			extensions: [
	// 				"urn:ietf:params:rtp-hdrext:ssrc-audio-level",
	// 				"http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time",
	// 				"http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
	// 				"urn:ietf:params:rtp-hdrext:sdes:mid",
	// 			],
	// 		},

	// 	},
	// });

	const sdpAnswer =
		`m=audio ${iceCandidate.port} ICE/SDP\n` +
		`a=fingerprint:sha-256 ${fingerprint.value}\n` +
		`c=IN IP4 ${iceCandidate.ip}\n` +
		`a=rtcp:${iceCandidate.port}\n` +
		`a=ice-ufrag:${iceParameters.usernameFragment}\n` +
		`a=ice-pwd:${iceParameters.password}\n` +
		`a=fingerprint:sha-256 ${fingerprint.value}\n` +
		`a=candidate:1 1 ${iceCandidate.protocol.toUpperCase()} ${
			iceCandidate.priority
		} ${iceCandidate.ip} ${iceCandidate.port} typ ${iceCandidate.type}\n`;

	// const sdpAnswer = answer.toString();

	const supportedCodecs: MediaSoupTypes.RtpCodecCapability[] = [
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
			preferredPayloadType: data.codecs?.find((val) => val.name == "opus")
				?.payload_type,
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
			preferredPayloadType: data.codecs?.find((val) => val.name == "H264")
				?.payload_type,
		},
		{
			kind: "video",
			mimeType: "video/rtx",
			clockRate: 90000,
			parameters: {
				apt: data.codecs?.find((val) => val.name == "H264")
					?.payload_type,
			},
			preferredPayloadType:
				data.codecs?.find((val) => val.name == "H264")
					?.rtx_payload_type ?? undefined,
		},
	];

	this.client.supportedCodecs = supportedCodecs;

	console.debug("onSelectProtocol sdp serialized\n", sdpAnswer);
	await Send(this, {
		op: VoiceOPCodes.SELECT_PROTOCOL_ACK,
		d: {
			// audio_codec: audioCodec.mimeType.split("/")[1],
			// video_codec: videoCodec.mimeType.split("/")[1],
			audioCodec: "opus",
			videoCodec: "H264",
			media_session_id: this.session_id,
			sdp: sdpAnswer,
		},
	});
}

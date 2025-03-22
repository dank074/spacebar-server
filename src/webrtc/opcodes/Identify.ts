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

import { CLOSECODES, Payload, Send, WebSocket } from "@spacebar/gateway";
import {
	validateSchema,
	VoiceIdentifySchema,
	VoiceReadySchema,
	VoiceState,
} from "@spacebar/util";
import {
	getClients,
	getLocalIp,
	getOrCreateRouter,
	Stream,
	VoiceOPCodes,
	webrtcServer,
} from "@spacebar/webrtc";
import * as SemanticSDP from "semantic-sdp";
import defaultSDP from "./sdp.json";

// {
// 	"max_dave_protocol_version": 0,
// 	"server_id": "",
// 	"session_id": "",
// 	"streams": [
// 		{
// 			"quality": 100,
// 			"rid": "100",
// 			"type": "video"
// 		}
// 	],
// 	"token": "",
// 	"user_id": "",
// 	"video": true
// }

export interface IdentifyPayload extends Payload {
	d: {
		server_id: string; //guild id
		session_id: string; //gateway session
		streams: Stream[];
		token: string; //voice_states token
		user_id: string;
		video: boolean;
		max_dave_protocol_version?: number; // present in v8, not sure what version added it
	};
}

export async function onIdentify(this: WebSocket, data: IdentifyPayload) {
	clearTimeout(this.readyTimeout);

	const { server_id, user_id, session_id, token, streams, video } =
		validateSchema("VoiceIdentifySchema", data.d) as VoiceIdentifySchema;

	const voiceState = await VoiceState.findOne({
		where: { guild_id: server_id, user_id, token, session_id },
	});
	if (!voiceState) return this.close(CLOSECODES.Authentication_failed);

	this.user_id = user_id;
	this.session_id = session_id;

	const server = webrtcServer;

	this.client = {
		websocket: this,
		channel_id: voiceState.channel_id,
		supportedCodecs: [],
		supportedHeaders: [],
		audio_ssrc: 0,
		video_ssrc: 0,
		rtx_ssrc: 0,
		sdpOffer: "",
	};

	server.join(voiceState.channel_id, this.client);
	// setInterval(async () => {
	// 	if (producerTransport.closed) return;
	// 	console.log(
	// 		`transport stats`,
	// 		JSON.stringify(await producerTransport.getStats(), null, 4),
	// 	);
	// 	console.log(
	// 		`transport dump`,
	// 		JSON.stringify(await producerTransport.dump(), null, 4),
	// 	);
	// }, 10 * 1000);

	/*
	const offer = SemanticSDP.SDPInfo.expand(defaultSDP);
	offer.setDTLS(
		SemanticSDP.DTLSInfo.expand({
			setup: "actpass",
			hash: "sha-256",
			fingerprint: `${producerTransport.dtlsParameters.fingerprints[0].algorithm} ${producerTransport.dtlsParameters.fingerprints[0].value}`,
		}),
	);
	*/

	const d = {
		op: VoiceOPCodes.READY,
		d: {
			ssrc: this.client.video_ssrc, // this is just a base, first stream ssrc will be +1 with rtx +2
			streams: streams?.map((x) => ({
				...x,
				ssrc: ++this.client!.video_ssrc, // first stream should be 2
				rtx_ssrc: ++this.client!.video_ssrc, // first stream should be 3
			})),
			ip: "127.0.0.1",
			port: 9009,
			modes: [
				// "aead_aes256_gcm_rtpsize",
				// "aead_aes256_gcm",
				// "aead_xchacha20_poly1305_rtpsize",
				// "xsalsa20_poly1305_lite_rtpsize",
				// "xsalsa20_poly1305_lite",
				// "xsalsa20_poly1305_suffix",
				// "xsalsa20_poly1305",
			],
			experiments: ["fixed_keyframe_interval"],
		} as VoiceReadySchema,
	};

	console.debug(`onIdentify(ready packet)`, d);
	await Send(this, d);
}

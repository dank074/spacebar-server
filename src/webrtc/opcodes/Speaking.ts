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
import { getClients, VoiceOPCodes } from "../util";

// {"speaking":1,"delay":5,"ssrc":2805246727}

export async function onSpeaking(this: WebSocket, data: Payload) {
	if (!this.client) return;

	getClients(this.client.channel_id).forEach((client) => {
		if (client.websocket.user_id === this.user_id) return;

		//const consumer = client.consumers.find((x) => x.kind === "audio" && x.appData.user_id === this.user_id)
		Send(client.websocket, {
			op: VoiceOPCodes.SPEAKING,
			d: {
				user_id: this.user_id,
				speaking: data.d.speaking,
				ssrc: data.d.ssrc, //consumer?.rtpParameters?.encodings?.find(y => y !== undefined)?.ssrc || 0,
			},
		});
	});
}

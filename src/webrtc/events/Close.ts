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
import { Session } from "@spacebar/util";
import { getClients } from "../util";

export async function onClose(this: WebSocket, code: number, reason: string) {
	console.log("[WebRTC] closed", code, reason.toString());

	if (this.session_id) await Session.delete({ session_id: this.session_id });

	// we need to find all consumers on all clients that have a producer in our client
	const clients = getClients(this.client?.channel_id!);

	for (const client of clients) {
		if (client.websocket.user_id === this.user_id) continue;

		// if any consumer on this client has a producer id that is in our client, close it
		client.consumers.forEach((consumer) => {
			if (
				this.client?.producers.audio?.id === consumer.producerId ||
				this.client?.producers.video?.id === consumer.producerId
			) {
				console.log("[WebRTC] closing consumer", consumer.id);
				consumer.close();
			}
		});
	}

	this.client?.transport?.close();
	this.client?.producers.audio?.close();
	this.client?.producers.video?.close();

	this.removeAllListeners();
}

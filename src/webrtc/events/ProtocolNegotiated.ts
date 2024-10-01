import { WebSocket } from "@spacebar/gateway";
import { getClients } from "../util";

export async function OnProtocolNegotiated(this: WebSocket) {
	if (!this.client || !this.client.transport) return;
	// we need to find all producers on all clients that are in the current channel so we can consume them
	const clients = getClients(this.client.channel_id!);

	for (const client of clients) {
		if (client.websocket.user_id === this.user_id) continue;
		if (!client.transport) continue;

		if (client.producers.audio) {
			// first check that no consumer exists, if none exist then create consumer
			const audioConsumer = this.client.consumers.find(
				(x) =>
					x.kind === "audio" &&
					x.appData.user_id === client.websocket.user_id,
			);
			if (!audioConsumer) {
				const consumer = await this.client.transport.consume({
					producerId: client.producers.audio.id,
					rtpCapabilities: {
						codecs: this.client.supportedCodecs,
						headerExtensions: this.client.headerExtensions,
					},
					paused: false,
					appData: {
						user_id: client.websocket.user_id,
					},
				});
				this.client.consumers.push(consumer);
			}
		}
		if (client.producers.video) {
			// first check that no consumer exists, if none exist then create consumer
			const videoConsumer = this.client.consumers.find(
				(x) =>
					x.kind === "video" &&
					x.appData.user_id === client.websocket.user_id,
			);
			if (!videoConsumer) {
				const consumer = await this.client.transport.consume({
					producerId: client.producers.video.id,
					rtpCapabilities: {
						codecs: this.client.supportedCodecs,
						headerExtensions: this.client.headerExtensions,
					},
					paused: false,
					appData: {
						user_id: client.websocket.user_id,
					},
					preferredLayers: {
						spatialLayer: 1,
						temporalLayer: 0,
					},
					//mid: "2"
				});
				this.client.consumers.push(consumer);
			}
		}
	}
}

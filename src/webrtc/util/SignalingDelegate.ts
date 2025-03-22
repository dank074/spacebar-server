import { WebRtcClient } from "./WebRtcClient";

export interface SignalingDelegate {
	start: () => Promise<void>;
	join: (id: string, client: WebRtcClient) => void;
	onOffer: (offer: string) => Promise<string>;
	onClientClose: () => void;
	updateSDP(offer: string): void;
	createChannelRouter(channelId: string): void;
	disposeChannelRouter(channelId: string): void;
	channels(): Map<string, Set<WebRtcClient>>;
}

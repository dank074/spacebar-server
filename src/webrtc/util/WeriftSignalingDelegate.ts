import { Codec, WebRtcClient } from "./WebRtcClient";
import { SignalingDelegate } from "./SignalingDelegate";
import {
	RTCDtlsFingerprint,
	RTCDtlsParameters,
	RTCPeerConnection,
	RTCRtpCodecParameters,
} from "werift";

export class WeriftSingalingDelegate implements SignalingDelegate {
	private _channels: Map<string, Set<WebRtcClient>> = new Map<
		string,
		Set<WebRtcClient>
	>();

	public start(): Promise<void> {
		return Promise.resolve();
	}

	public join(id: string, client: WebRtcClient): void {
		if (!this._channels.has(id)) {
			this.createChannelRouter(id);
		}
		const set = this._channels.get(id);
		set!.add(client);
	}

	public async onOffer(offer: string): Promise<string> {
		const peer = new RTCPeerConnection({
			iceServers: [],
			codecs: {
				audio: [
					new RTCRtpCodecParameters({
						mimeType: "audio/opus",
						clockRate: 48000,
						channels: 2,
					}),
				],
				video: [
					new RTCRtpCodecParameters({
						mimeType: "video/H264",
						clockRate: 90000,
						rtcpFeedback: [
							{ type: "nack" },
							{ type: "nack", parameter: "pli" },
							{ type: "goog-remb" },
						],
						parameters:
							"profile-level-id=42e01f;packetization-mode=1;level-asymmetry-allowed=1",
					}),
				],
			},
			dtls: {
				keys: {
					keyPem: `-----BEGIN PRIVATE KEY-----
MIIEugIBADANBgkqhkiG9w0BAQEFAASCBKQwggSgAgEAAoIBAQC46q1Ayn3+w5t7
3cCXYQmkGMLqUAoXDklHJNUFQefClB5E7vSiAwIfdb+8xJmSNpD1XKmS2h01849v
vmNRaqxfj/6xUBcunJjQvLXmcxkTCnTjnCZkiEGZqC1TWT4xH9ABdqzpOK5xLNvC
ghIB3oDybXYvMto3DC+HscjUdoDM3URXnzyvqdOvMYprG6pTmBjp9GrDy1V8h2LD
KCq94vh9He5nFVRFRoZpADqjNR+R1v8b1iFq9fmFua7o8TV7sJJl8WHyGroRTcZ7
K6bXI14Pzbk+ens98+83vqx9fWwm2CeLyRVsnWFLpm4TX1hr45p+gf4PUpox6gXE
pdd8Jq8RAgMBAAECgf8GUf8Z99HWo1jtIucyRV7O/QmseI/fud1HUTr2swn43Jcs
Q/6YiwHHkX68NPwKw1KxEDm7izj0Xx7H8vnyDnNV0NYjuVkRfsi6Wbjd55Ez1Wep
X+zwArg7SEREVQiLJUs2wZenYQiVVbMtMsTqy3Ac2SDw/Av5VbFKMglrOaGtXtO7
l4HQzecgaINAiPKxodAjful+FXUMfrAqm/jEZJn0+df+ChyZDtxINqJF9HhE7Q2Q
U2o/vZaWc9/PLhCngQiQ+bBTBACr5hSKx7SBvvMruBP4NZxX5fdvrmo+MUE5t8j+
aDHs6x+cnvev8Gz75I3fQyGMKdEWfPDLtehq89UCgYEA9Z7vYZD8Qahpd9jTThOR
/y+bZFJyT2Fo6tjONJa3pUcgGvL5zUFKy/X1PK5JrrAkNBMyoJS4vQV3q12SN8Vo
ybSvRe5dX4sOdSun5+YmNA8FM25En/LUdm6WjUPaybvcXkoGySym1d+HxoRveD7e
gePo1GEtIXwjjEYiCg8PRF0CgYEAwLsPPOmufhrv4f6aRu05GR8HFWonS15ZXUC8
UYo2fCxqDuU9DfezzcFWl/JSCzyEy1VTqoiLJESMRQYg1qzx1UNJRnLJu3Mwo398
g1jSi4bP32FmtS2aD+lm/N64pNIurR7hWHcoUAXh0b2NfAZxscSKcRM/Yrt8f9Hc
7j36KkUCgYAMyKfm6RfoBu7uWO+uiaA4qu6oiw3+CbDfQEeDPzDxvkDyhiDwSOyu
ru+DqAKXv/0yZKlm6DaxR96Rob4hfvnUPb49ooljlqY6/PmxPS5R2VJI+f1CYe4i
9+CIG7cAdvGiSrINuHA6g3baozv2AzerhQQyQZiKvJ5RB7lv0pbV1QKBgDvEBkaq
ZI0Ah3D6hhcGi1VJ9OVkJMlPecDcSUmz5Y9+KmlyFwvUy3I7yUGXSG/plXiEfkx8
yUE27JSfAOHxgZDTq85n3Dz/zI53A0Kr8aaI6L9psfLvMD5M773sxy99ajIPSGwp
j1u5ZzymXlCeovUwcIn+IQLaBxKQHsXWfFRNAoGABk3ofKvXjmJ5BO+QpMlIs7rQ
z6Ys4JtiryFaflaeQ8LrIRd5BiRpTqnOv83kTJnxvFR916H5Ex49Rx9cwKPrW3nG
HOL2G5ZkKQ8dx8Z0mmynMYFJ8Qu094fVvyMZY3OTgnJgBVdjbKkknsWnuLRsPtRi
2L3pbhPiT7ITVBRgSyw=
-----END PRIVATE KEY-----`,
					certPem: `-----BEGIN CERTIFICATE-----
MIIDazCCAlOgAwIBAgIUYnv43jjN/uY1plA9crAVWGKY2OAwDQYJKoZIhvcNAQEL
BQAwRTELMAkGA1UEBhMCQVUxEzARBgNVBAgMClNvbWUtU3RhdGUxITAfBgNVBAoM
GEludGVybmV0IFdpZGdpdHMgUHR5IEx0ZDAeFw0yNTAzMjIwNzEzMzVaFw0yNjAz
MjIwNzEzMzVaMEUxCzAJBgNVBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEw
HwYDVQQKDBhJbnRlcm5ldCBXaWRnaXRzIFB0eSBMdGQwggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQC46q1Ayn3+w5t73cCXYQmkGMLqUAoXDklHJNUFQefC
lB5E7vSiAwIfdb+8xJmSNpD1XKmS2h01849vvmNRaqxfj/6xUBcunJjQvLXmcxkT
CnTjnCZkiEGZqC1TWT4xH9ABdqzpOK5xLNvCghIB3oDybXYvMto3DC+HscjUdoDM
3URXnzyvqdOvMYprG6pTmBjp9GrDy1V8h2LDKCq94vh9He5nFVRFRoZpADqjNR+R
1v8b1iFq9fmFua7o8TV7sJJl8WHyGroRTcZ7K6bXI14Pzbk+ens98+83vqx9fWwm
2CeLyRVsnWFLpm4TX1hr45p+gf4PUpox6gXEpdd8Jq8RAgMBAAGjUzBRMB0GA1Ud
DgQWBBSRgGxWOZHFNKRhY1csrl+X21bTSDAfBgNVHSMEGDAWgBSRgGxWOZHFNKRh
Y1csrl+X21bTSDAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQBl
1kcKNet8TKQIJvFxRxnsp1EYVbUsU4+jYWWWm7052MXmzg5HjY7zo/25uy5Lx92J
S0KRqxJOmWsweVaM+O4rI1ORx7IeklNYWrjcWcR6DTbvmQn7WV6oIP/pL0ga1b6U
Z2UdxbejyYCrWIy0Ld1L0wjxc0+mXlS78jsanid8cki4Tyr6RD+xrx8ckRp19tIn
ykWAKHL7pg8Pp33b+pfMiTrdPuWVtcoumtxe+JpORQ5gkWmxtRGnE9CqA7RYEOVg
B+leXSc9Rp3y3b2uEMFwBOjZmOCMDERLwWyiEifvspYgz0/wlPWEQyKazYLJHSOY
GTqi2sOQqnaiJ0yxatI7
-----END CERTIFICATE-----`,
					signatureHash: { signature: 1, hash: 4 },
				},
			},
		});

		peer.addTransceiver("video", { direction: "sendrecv" });

		peer.addTransceiver("audio", { direction: "sendrecv" });

		await peer.setRemoteDescription({ type: "offer", sdp: offer });

		peer.onconnectionstatechange = () => {
			console.log("onconnectionstatechange", peer.connectionState);
		};

		peer.oniceconnectionstatechange = () => {
			console.log("oniceconnectionstatechange", peer.iceConnectionState);
		};

		peer.dtlsTransports[0].dtls?.onError.subscribe((error) => {
			console.log("dtls failed", error);
		});

		console.log(peer.dtlsTransports);

		peer.dtlsTransports[0].onStateChange.subscribe((state) => {
			console.log("dtls state", state);
		});

		const answer = await peer.createAnswer();

		const sdp = await new Promise<string>(async (resolve, reject) => {
			let timerStarted = false;

			peer.onicecandidate = ({ candidate }) => {
				console.log("onicecandidate", candidate);
				if (timerStarted) {
					return;
				}
				timerStarted = true;
				resolve(
					peer.localDescription?.sdp! +
						"a=" +
						candidate?.candidate +
						"\n",
				);
			};

			await peer.setLocalDescription(answer);
		});

		return Promise.resolve(sdp);
	}

	public onClientClose(): void {
		throw new Error("Method not implemented.");
	}

	public updateSDP(offer: string): void {
		throw new Error("Method not implemented.");
	}

	public createChannelRouter(channelId: string): void {
		this._channels.set(channelId, new Set<WebRtcClient>());
	}

	public disposeChannelRouter(channelId: string): void {
		this._channels.delete(channelId);
	}

	public channels(): Map<string, Set<WebRtcClient>> {
		return this._channels;
	}
}

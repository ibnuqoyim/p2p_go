# Simple P2P WebRTC Application

This is a simple peer-to-peer WebRTC application that allows for video/audio communication and text chat between two peers. It consists of a Go backend using Pion WebRTC for signaling and a JavaScript frontend.

## Features

- Video and audio communication between peers
- Text chat via WebRTC data channels
- Simple signaling server for peer discovery and connection establishment
- Responsive UI design

## Project Structure

```
p2p-go/
├── backend/
│   └── main.go          # Go signaling server
├── frontend/
│   ├── index.html       # HTML user interface
│   ├── style.css        # CSS styling
│   └── app.js           # JavaScript WebRTC client
├── go.mod               # Go module definition
└── README.md            # This file
```

## Prerequisites

- Go 1.21+
- Modern web browser (Chrome, Firefox, Safari, Edge)

## Running the Application

1. Start the Go backend server:

```bash
cd backend
go run main.go
```

2. Open a web browser and navigate to: http://localhost:8080

3. Enter a unique ID for yourself and click "Connect to Server"

4. Choose another peer from the dropdown and click "Call" to initiate a connection

## How it Works

1. The Go server acts as a signaling service to help peers discover each other and exchange WebRTC connection information
2. When a peer connects, they register with the signaling server and can see other connected peers
3. Peers exchange SDP offers/answers and ICE candidates through the signaling server
4. Once the WebRTC connection is established, video/audio and chat data flows directly between peers (P2P)

## Technologies Used

- [Pion WebRTC](https://github.com/pion/webrtc): Go implementation of WebRTC
- [Gorilla WebSocket](https://github.com/gorilla/websocket): WebSocket implementation for Go
- Browser WebRTC API: For client-side WebRTC functionality

## License

MIT

package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v3"
)

// Peer represents a client connected to our signaling server
type Peer struct {
	id         string
	conn       *websocket.Conn
	mutex      sync.Mutex
	candidates []webrtc.ICECandidateInit
}

// Message represents the structure of our WebSocket messages
type Message struct {
	Type    string          `json:"type"`
	To      string          `json:"to,omitempty"`
	From    string          `json:"from,omitempty"`
	Payload json.RawMessage `json:"payload"`
}

var (
	addr     = flag.String("addr", ":443", "http service address")
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true // Allow all connections for simplicity
		},
	}
	peers = make(map[string]*Peer)
	mutex = sync.Mutex{}
)

func main() {
	flag.Parse()

	// Serve static files
	fs := http.FileServer(http.Dir("../frontend"))
	http.Handle("/", fs)

	// WebSocket endpoint for signaling
	http.HandleFunc("/ws", handleWebSocket)

	fmt.Printf("Server is running on http://localhost%s\n", *addr)
	log.Fatal(http.ListenAndServe(*addr, nil))
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Error upgrading to WebSocket: %v", err)
		return
	}
	defer conn.Close()

	// Get peer ID from query parameter
	peerId := r.URL.Query().Get("id")
	if peerId == "" {
		log.Println("Peer ID not provided")
		return
	}

	// Create a new peer
	peer := &Peer{
		id:         peerId,
		conn:       conn,
		candidates: []webrtc.ICECandidateInit{},
	}

	// Register peer
	mutex.Lock()
	peers[peerId] = peer
	mutex.Unlock()

	log.Printf("Peer connected: %s", peerId)

	// Handle incoming messages
	for {
		_, rawMsg, err := conn.ReadMessage()
		if err != nil {
			log.Printf("Error reading message: %v", err)
			break
		}

		var msg Message
		if err := json.Unmarshal(rawMsg, &msg); err != nil {
			log.Printf("Error unmarshaling message: %v", err)
			continue
		}

		// Set the sender ID
		msg.From = peerId

		// Process the message
		switch msg.Type {
		case "offer", "answer", "ice-candidate":
			// Forward the message to the target peer
			if targetPeer, ok := peers[msg.To]; ok {
				forwardMessage(targetPeer, msg)
			} else {
				log.Printf("Target peer not found: %s", msg.To)
			}
		case "get-peers":
			// Send list of available peers
			var peerList []string
			mutex.Lock()
			for id := range peers {
				if id != peerId {
					peerList = append(peerList, id)
				}
			}
			mutex.Unlock()

			peerListJSON, _ := json.Marshal(peerList)
			response := Message{
				Type:    "peer-list",
				From:    "server",
				To:      peerId,
				Payload: peerListJSON,
			}
			peer.mutex.Lock()
			if err := peer.conn.WriteJSON(response); err != nil {
				log.Printf("Error sending peer list: %v", err)
			}
			peer.mutex.Unlock()
		default:
			log.Printf("Unknown message type: %s", msg.Type)
		}
	}

	// Unregister peer
	mutex.Lock()
	delete(peers, peerId)
	mutex.Unlock()

	log.Printf("Peer disconnected: %s", peerId)
}

func forwardMessage(targetPeer *Peer, msg Message) {
	targetPeer.mutex.Lock()
	defer targetPeer.mutex.Unlock()

	if err := targetPeer.conn.WriteJSON(msg); err != nil {
		log.Printf("Error forwarding message: %v", err)
	}
}

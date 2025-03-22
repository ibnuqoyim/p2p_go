// DOM elements
const localIdInput = document.getElementById('local-id');
const connectButton = document.getElementById('connect-btn');
const peerConnectionDiv = document.getElementById('peer-connection');
const peerListSelect = document.getElementById('peer-list');
const refreshButton = document.getElementById('refresh-btn');
const callButton = document.getElementById('call-btn');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const statusElement = document.getElementById('status');
const chatContainer = document.getElementById('chat-container');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-btn');

// WebRTC configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Global variables
let socket;
let localStream;
let peerConnection;
let dataChannel;
let localPeerId;
let remotePeerId;

// Update status message
function updateStatus(message) {
    statusElement.textContent = message;
    console.log(message);
}

// Connect to signaling server
connectButton.addEventListener('click', async () => {
    localPeerId = localIdInput.value.trim();
    if (!localPeerId) {
        alert('Please enter your ID');
        return;
    }

    try {
        // Get user media (camera and microphone)
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        
        // Connect to WebSocket server
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        socket = new WebSocket(`${protocol}//${host}/ws?id=${localPeerId}`);
        
        socket.onopen = () => {
            updateStatus('Connected to signaling server');
            peerConnectionDiv.classList.remove('hidden');
            connectButton.disabled = true;
            localIdInput.disabled = true;
            
            // Request the list of available peers
            socket.send(JSON.stringify({
                type: 'get-peers'
            }));
        };
        
        socket.onclose = () => {
            updateStatus('Disconnected from signaling server');
            peerConnectionDiv.classList.add('hidden');
            connectButton.disabled = false;
            localIdInput.disabled = false;
            closePeerConnection();
        };
        
        socket.onerror = (error) => {
            updateStatus('WebSocket error: ' + error);
            console.error('WebSocket error:', error);
        };
        
        socket.onmessage = handleSignalingMessage;
    } catch (error) {
        updateStatus('Error: ' + error.message);
        console.error('Error:', error);
    }
});

// Handle incoming signaling messages
function handleSignalingMessage(event) {
    const message = JSON.parse(event.data);
    
    switch (message.type) {
        case 'peer-list':
            updatePeerList(JSON.parse(message.payload));
            break;
        case 'offer':
            handleOffer(message);
            break;
        case 'answer':
            handleAnswer(message);
            break;
        case 'ice-candidate':
            handleIceCandidate(message);
            break;
        default:
            console.log('Unknown message type:', message.type);
    }
}

// Update the list of available peers
function updatePeerList(peers) {
    peerListSelect.innerHTML = '<option value="">Select a peer</option>';
    
    peers.forEach(peerId => {
        const option = document.createElement('option');
        option.value = peerId;
        option.textContent = peerId;
        peerListSelect.appendChild(option);
    });
}

// Refresh the list of available peers
refreshButton.addEventListener('click', () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'get-peers'
        }));
    }
});

// Initiate call to selected peer
callButton.addEventListener('click', async () => {
    remotePeerId = peerListSelect.value;
    if (!remotePeerId) {
        alert('Please select a peer');
        return;
    }
    
    try {
        // Create peer connection
        createPeerConnection();
        
        // Create and send offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        socket.send(JSON.stringify({
            type: 'offer',
            to: remotePeerId,
            payload: JSON.stringify(offer)
        }));
        
        updateStatus('Calling ' + remotePeerId);
    } catch (error) {
        updateStatus('Error creating offer: ' + error.message);
        console.error('Error creating offer:', error);
    }
});

// Create RTCPeerConnection
function createPeerConnection() {
    // Close any existing connections
    closePeerConnection();
    
    // Create new connection
    peerConnection = new RTCPeerConnection(configuration);
    
    // Add local stream tracks to the connection
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
    
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.send(JSON.stringify({
                type: 'ice-candidate',
                to: remotePeerId,
                payload: JSON.stringify(event.candidate)
            }));
        }
    };
    
    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        updateStatus('Connection state: ' + peerConnection.connectionState);
    };
    
    // Handle ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
        updateStatus('ICE connection state: ' + peerConnection.iceConnectionState);
    };
    
    // Handle incoming tracks (remote video/audio)
    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };
    
    // Create data channel for chat
    dataChannel = peerConnection.createDataChannel('chat', {
        ordered: true
    });
    
    setupDataChannel(dataChannel);
    
    // Handle incoming data channels
    peerConnection.ondatachannel = (event) => {
        setupDataChannel(event.channel);
    };
}

// Set up data channel for messaging
function setupDataChannel(channel) {
    channel.onopen = () => {
        chatContainer.classList.remove('hidden');
        updateStatus('Data channel opened');
    };
    
    channel.onclose = () => {
        chatContainer.classList.add('hidden');
        updateStatus('Data channel closed');
    };
    
    channel.onmessage = (event) => {
        addMessage(event.data, false);
    };
}

// Handle incoming offer
async function handleOffer(message) {
    try {
        remotePeerId = message.from;
        
        // Create peer connection
        createPeerConnection();
        
        // Set remote description
        const offer = JSON.parse(message.payload);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        
        // Create and send answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        socket.send(JSON.stringify({
            type: 'answer',
            to: remotePeerId,
            payload: JSON.stringify(answer)
        }));
        
        updateStatus('Received call from ' + remotePeerId);
    } catch (error) {
        updateStatus('Error handling offer: ' + error.message);
        console.error('Error handling offer:', error);
    }
}

// Handle incoming answer
async function handleAnswer(message) {
    try {
        const answer = JSON.parse(message.payload);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        
        updateStatus('Call connected with ' + remotePeerId);
    } catch (error) {
        updateStatus('Error handling answer: ' + error.message);
        console.error('Error handling answer:', error);
    }
}

// Handle incoming ICE candidate
async function handleIceCandidate(message) {
    try {
        const candidate = JSON.parse(message.payload);
        if (candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    } catch (error) {
        updateStatus('Error handling ICE candidate: ' + error.message);
        console.error('Error handling ICE candidate:', error);
    }
}

// Close peer connection
function closePeerConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }
    
    remotePeerId = null;
    remoteVideo.srcObject = null;
    chatContainer.classList.add('hidden');
}

// Send chat message
sendButton.addEventListener('click', () => {
    const message = messageInput.value.trim();
    if (message && dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(message);
        addMessage(message, true);
        messageInput.value = '';
    }
});

messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendButton.click();
    }
});

// Add message to chat box
function addMessage(message, isSent) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isSent ? 'sent' : 'received'}`;
    messageElement.textContent = message;
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (socket) {
        socket.close();
    }
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    closePeerConnection();
});

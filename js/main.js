/************************************
rtcpeerconnection과 같은 실제 화상채팅을 하는 클라이언트 코드
************************************/


'use strict';

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
var turnReady;

var pcConfig = {
  'iceServers': [{
    'urls': 'stun:stun.l.google.com:19302'
  },
  {
    'urls':"turn:0.peer.js.com:3478"
  }]
};


// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true
};

/////////////////////////////////////////////

// var room = 'foo';
// Could prompt for room name:
// window.room = prompt('Enter room name:');
// room = $('#code-input').val();


// 랜덤 번호 생성
function createRandomNum() {
  var room = '';
  room = "cjtext" + Math.floor(Math.random() * 10000) + 1;
  document.getElementById("codeinput").value = room.toLowerCase();
}

// 화상채팅 시작
function startVideo() {
  var roomNumber = '';
  roomNumber = document.getElementById("codeinput").value.toLowerCase();
  startSocket(roomNumber);
}

function startSocket(room) {
  var socket = io.connect();

  if (room !== '') {
    socket.emit('create or join', room);
    console.log('Attempted to create or  join room', room);
  }
  
  socket.on('created', function(room) {
    console.log('Created room ' + room);
    isInitiator = true;
  });
  
  socket.on('full', function(room) {
    console.log('Room ' + room + ' is full');
  });
  
  socket.on('join', function (room){
    console.log('Another peer made a request to join room ' + room);
    console.log('This peer is the initiator of room ' + room + '!');
    isChannelReady = true;
  });
  
  socket.on('joined', function(room) {
    console.log('joined: ' + room);
    isChannelReady = true;
  });
  
  socket.on('log', function(array) {
    console.log.apply(console, array);
  });
  
  
  // sweet 추가 - oncollabo 소켓 채널 소켓이 열리면, 채널에 새로운 화상채팅이 열렸다고 알려주고, 서버는 이를 통해 create or join 채널을 통해 room에
  // socket.on('connect', function() {
  //   socket.emit("onCollabo", socket.id);
  // })
  
  ////////////////////////////////////////////////
  
  function sendMessage(message) {
    console.log('Client sending message: ', message);
    socket.emit('message', message);
  }
  
  // This client receives a message
  socket.on('message', function(message) {
    console.log('Client received message:', message);
    if (message === 'got user media') {
      maybeStart();
    } else if (message.type === 'offer') {
      if (!isInitiator && !isStarted) {
        maybeStart();
      }
      pc.setRemoteDescription(new RTCSessionDescription(message));
      doAnswer();
    } else if (message.type === 'answer' && isStarted) {
      pc.setRemoteDescription(new RTCSessionDescription(message));
    } else if (message.type === 'candidate' && isStarted) {
      var candidate = new RTCIceCandidate({ // icecandidate는 서로 통신 채널을 확립하기 위한 방법
        sdpMLineIndex: message.label,
        candidate: message.candidate
      });
      pc.addIceCandidate(candidate);
    } else if (message === 'bye' && isStarted) {
      handleRemoteHangup();
    }
  });
  
  ////////////////////////////////////////////////////
  
  
  var localVideo = document.querySelector('#localVideo');
  var remoteVideo = document.querySelector('#remoteVideo');
  
  navigator.mediaDevices.getUserMedia({
    audio: false,
    video: true
  })
  .then(gotStream)
  .catch(function(e) {
    alert('getUserMedia() error: ' + e.name);
  });
  
  function gotStream(stream) {
    console.log('Adding local stream.');
    localStream = stream;
    localVideo.srcObject = stream;
    sendMessage('got user media');
    if (isInitiator) { // 방을 최초로 생성한 사람인 경우 true
      maybeStart();
    }
  }
  
  var constraints = {
    video: true
  };
  
  console.log('Getting user media with constraints', constraints);
  
  if (location.hostname !== 'localhost') {
    requestTurn(
      'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
    );
  }
  
  function maybeStart() {
    console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
    if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
      console.log('>>>>>> creating peer connection');
      createPeerConnection(); // peerconnection을 만들어주고 localstream을 붙인다.
      pc.addStream(localStream);
      isStarted = true; // 함수 실행 시 true로 변경된다.
      console.log('isInitiator', isInitiator);
      if (isInitiator) {
        doCall(); // 같은 방에 있는 client에게 rtc 요청을 하게 된다.
      }
    }
  }
  
  window.onbeforeunload = function() {
    sendMessage('bye');
  };
  
  /////////////////////////////////////////////////////////
  
  function createPeerConnection() {
    try {
      pc = new RTCPeerConnection(null);
      //pc = new RTCPeerConnection(pcConfig); // 수정하기!! pcConfig 값으로 pc 생성
      pc.onicecandidate = handleIceCandidate;
      pc.onaddstream = handleRemoteStreamAdded; // remotestream이 들어오면 발생하는 이벤트
      pc.onremovestream = handleRemoteStreamRemoved;
      console.log('Created RTCPeerConnnection');
    } catch (e) {
      console.log('Failed to create PeerConnection, exception: ' + e.message);
      alert('Cannot create RTCPeerConnection object.');
      return;
    }
  }
  
  function handleIceCandidate(event) {
    console.log('icecandidate event: ', event);
    if (event.candidate) {
      sendMessage({
        type: 'candidate',
        label: event.candidate.sdpMLineIndex,
        id: event.candidate.sdpMid,
        candidate: event.candidate.candidate
      });
    } else {
      console.log('End of candidates.');
    }
  }
  
  function handleCreateOfferError(event) {
    console.log('createOffer() error: ', event);
  }
  
  function doCall() {
    console.log('Sending offer to peer');
    pc.createOffer(setLocalAndSendMessage, handleCreateOfferError); // createoffer를 통해 통신 요청한다.
  }
  
  function doAnswer() {
    console.log('Sending answer to peer.');
    pc.createAnswer().then(
      setLocalAndSendMessage,
      onCreateSessionDescriptionError
    );
  }
  
  function setLocalAndSendMessage(sessionDescription) {
    pc.setLocalDescription(sessionDescription);
    console.log('setLocalAndSendMessage sending message', sessionDescription);
    sendMessage(sessionDescription);
  }
  
  function onCreateSessionDescriptionError(error) {
    trace('Failed to create session description: ' + error.toString());
  }
  
  function requestTurn(turnURL) {
    var turnExists = false;
    for (var i in pcConfig.iceServers) {
      if (pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
        turnExists = true;
        turnReady = true;
        break;
      }
    }
    if (!turnExists) {
      console.log('Getting TURN server from ', turnURL);
      // No TURN server. Get one from computeengineondemand.appspot.com:
      var xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
          var turnServer = JSON.parse(xhr.responseText);
          console.log('Got TURN server: ', turnServer);
          pcConfig.iceServers.push({
            'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
            'credential': turnServer.password
          });
          turnReady = true;
        }
      };
      xhr.open('GET', turnURL, true);
      xhr.send();
    }
  }
  
  function handleRemoteStreamAdded(event) {
    console.log('Remote stream added.');
    remoteStream = event.stream;
    remoteVideo.srcObject = remoteStream;
  
    // sweet
    remoteVideo.classList.add("remoteVideoInChatting");
    localVideo.classList.add("localVideoInChatting");
  }
  
  function handleRemoteStreamRemoved(event) {
    console.log('Remote stream removed. Event: ', event);
  }
  
  function hangup() {
    console.log('Hanging up.');
    stop();
    sendMessage('bye');
  }
  
  function handleRemoteHangup() {
    //sweet
    remoteVideo.classList.remove("remoteVideoInChatting");
    localVideo.classList.remove("localVideoInChatting");
  
    console.log('Session terminated.');
    stop();
    isInitiator = false;
  }
  
  function stop() {
    isStarted = false;
    pc.close();
    pc = null;
  }
}


import * as BABYLON from 'babylonjs';
import * as GUI from 'babylonjs-gui';
import { Room } from "colyseus.js";

import Menu from "./menu";
import { createSkyBox } from "./utils";

import * as Livekit from 'livekit-client';
import { LocalParticipant, LocalTrackPublication, Participant, RemoteParticipant, RemoteTrack, RemoteTrackPublication, RoomEvent, Track, VideoPresets } from 'livekit-client';

const GROUND_SIZE = 500;

export default class Game {
    private canvas: HTMLCanvasElement;
    private engine: BABYLON.Engine;
    private scene: BABYLON.Scene;
    private camera: BABYLON.ArcRotateCamera;
    private light: BABYLON.Light;

    private room: Room<any>;
    private playerEntities: { [playerId: string]: BABYLON.Mesh } = {};
    private playerNextPosition: { [playerId: string]: BABYLON.Vector3 } = {};

    private lk_room: Livekit.Room;

    constructor(canvas: HTMLCanvasElement, engine: BABYLON.Engine, room: Room<any>) {
        this.canvas = canvas;
        this.engine = engine;
        this.room = room;

        this.initLiveKit();
    }

    async initLiveKit() {

        var token = " eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2OTMxMzA0MzQsImlzcyI6IkFQSUVIc2FqNXdDdGoyViIsImp0aSI6InRvbnlfc3RhcmsiLCJuYW1lIjoiVG9ueSBTdGFyayIsIm5iZiI6MTY1NzEzMDQzNCwic3ViIjoidG9ueV9zdGFyayIsInZpZGVvIjp7InJvb20iOiJzdGFyay10b3dlciIsInJvb21Kb2luIjp0cnVlfX0.DACVin9DQtOvJemiaNsbLmCxcfh_5FEgAuWx3xyuxrk";
        var room = this.lk_room;
        // LiveKit code
        room = new Livekit.Room({
            // automatically manage subscribed video quality
            adaptiveStream: true,
          
            // optimize publishing bandwidth and CPU for published tracks
            dynacast: true,
          
            // default capture settings
            videoCaptureDefaults: {
              resolution: VideoPresets.h720.resolution,
            },
          });

          room
            .on(RoomEvent.TrackSubscribed, this.handleTrackSubscribed)
            .on(RoomEvent.TrackUnsubscribed, this.handleTrackUnsubscribed)
            // .on(RoomEvent.ActiveSpeakersChanged, this.handleActiveSpeakerChange)
            .on(RoomEvent.Disconnected, this.handleDisconnect)
            .on(RoomEvent.LocalTrackUnpublished, this.handleLocalTrackUnpublished);

            // connect to room
            await room.connect('ws://localhost:7800', token);
            console.log('connected to room', room.name);

            // publish local camera and mic tracks
            await room.localParticipant.enableCameraAndMicrophone();
    }

    handleTrackSubscribed(
        track: RemoteTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) {
        if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) {
          // attach it to a new HTMLVideoElement or HTMLAudioElement
          const element = track.attach();
          this.canvas.parentElement.appendChild(element);
        }
      }
      
      handleTrackUnsubscribed(
        track: RemoteTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) {
        // remove tracks from all attached elements
        track.detach();
      }
      
      handleLocalTrackUnpublished(track: LocalTrackPublication, participant: LocalParticipant) {
        // when local tracks are ended, update UI to remove them from rendering
        // track.detach();
      }
      
      handleActiveSpeakerChange(speakers: Participant[]) {
        // show UI indicators when participant is speaking
      }
      
      handleDisconnect() {
        console.log('disconnected from room');
      }

    initPlayers(): void {
        this.room.state.players.onAdd((player, sessionId) => {
            const isCurrentPlayer = (sessionId === this.room.sessionId);

            const sphere = BABYLON.MeshBuilder.CreateSphere(`player-${sessionId}`, {
                segments: 8,
                diameter: 40
            }, this.scene);

            // Set player mesh properties
            const sphereMaterial = new BABYLON.StandardMaterial(`playerMat-${sessionId}`, this.scene);
            sphereMaterial.emissiveColor = (isCurrentPlayer) ? BABYLON.Color3.FromHexString("#ff9900") : BABYLON.Color3.Gray();
            sphere.material = sphereMaterial;

            // Set player spawning position
            sphere.position.set(player.x, player.y, player.z);

            this.playerEntities[sessionId] = sphere;
            this.playerNextPosition[sessionId] = sphere.position.clone();

            // update local target position
            player.onChange(() => {
                this.playerNextPosition[sessionId].set(player.x, player.y, player.z);
            });
        });

        this.room.state.players.onRemove((player, playerId) => {
            this.playerEntities[playerId].dispose();
            delete this.playerEntities[playerId];
            delete this.playerNextPosition[playerId];
        });

        this.room.onLeave(code => {
            this.gotoMenu();
        })
    }

    createGround(): void {
        // Create ground plane
        const plane = BABYLON.MeshBuilder.CreatePlane("plane", { size: GROUND_SIZE }, this.scene);
        plane.position.y = -15;
        plane.rotation.x = Math.PI / 2;

        let floorPlane = new BABYLON.StandardMaterial('floorTexturePlane', this.scene);
        floorPlane.diffuseTexture = new BABYLON.Texture('./public/ground.jpg', this.scene);
        floorPlane.backFaceCulling = false; // Always show the front and the back of an element

        let materialPlane = new BABYLON.MultiMaterial('materialPlane', this.scene);
        materialPlane.subMaterials.push(floorPlane);

        plane.material = materialPlane;
    }

    displayGameControls() {
        const advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI("textUI");

        const playerInfo = new GUI.TextBlock("playerInfo");
        playerInfo.text = `Room name: ${this.room.name}      Player: ${this.room.sessionId}`.toUpperCase();
        playerInfo.color = "#eaeaea";
        playerInfo.fontFamily = "Roboto";
        playerInfo.fontSize = 20;
        playerInfo.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        playerInfo.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        playerInfo.paddingTop = "10px";
        playerInfo.paddingLeft = "10px";
        playerInfo.outlineColor = "#000000";
        advancedTexture.addControl(playerInfo);

        const instructions = new GUI.TextBlock("instructions");
        instructions.text = "CLICK ANYWHERE ON THE GROUND!";
        instructions.color = "#fff000"
        instructions.fontFamily = "Roboto";
        instructions.fontSize = 24;
        instructions.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        instructions.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
        instructions.paddingBottom = "10px";
        advancedTexture.addControl(instructions);

        // back to menu button
        const button = GUI.Button.CreateImageWithCenterTextButton("back", "<- BACK", "./public/btn-default.png");
        button.width = "100px";
        button.height = "50px";
        button.fontFamily = "Roboto";
        button.thickness = 0;
        button.color = "#f8f8f8";
        button.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        button.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        button.paddingTop = "10px";
        button.paddingRight = "10px";
        button.onPointerClickObservable.add(async () => {
            await this.room.leave(true);
        });
        advancedTexture.addControl(button);
    }

    bootstrap(): void {
        this.scene = new BABYLON.Scene(this.engine);
        this.light = new BABYLON.HemisphericLight("pointLight", new BABYLON.Vector3(), this.scene);
        this.camera = new BABYLON.ArcRotateCamera("camera", Math.PI / 2, 1.0, 550, BABYLON.Vector3.Zero(), this.scene);
        this.camera.setTarget(BABYLON.Vector3.Zero());

        createSkyBox(this.scene);
        this.createGround();
        this.displayGameControls();
        this.initPlayers();

        this.scene.onPointerDown = (event, pointer) => {
            if (event.button == 0) {
                const targetPosition = pointer.pickedPoint.clone();

                // Position adjustments for the current play ground.
                targetPosition.y = -1;
                if (targetPosition.x > 245) targetPosition.x = 245;
                else if (targetPosition.x < -245) targetPosition.x = -245;
                if (targetPosition.z > 245) targetPosition.z = 245;
                else if (targetPosition.z < -245) targetPosition.z = -245;

                this.playerNextPosition[this.room.sessionId] = targetPosition;

                // Send position update to the server
                this.room.send("updatePosition", {
                    x: targetPosition.x,
                    y: targetPosition.y,
                    z: targetPosition.z,
                });
            }
        };

        this.doRender();
    }

    private gotoMenu() {
        this.scene.dispose();
        const menu = new Menu('renderCanvas');
        menu.createMenu();
    }

    private doRender(): void {
        // constantly lerp players
        this.scene.registerBeforeRender(() => {
            for (let sessionId in this.playerEntities) {
              const entity = this.playerEntities[sessionId];
              const targetPosition = this.playerNextPosition[sessionId];
              entity.position = BABYLON.Vector3.Lerp(entity.position, targetPosition, 0.05);
            }
        });

        // Run the render loop.
        this.engine.runRenderLoop(() => {
            this.scene.render();
        });

        // The canvas/window resize event handler.
        window.addEventListener('resize', () => {
            this.engine.resize();
        });
    }
}

import React from "react";
import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import alea from "alea";
import AvatarImage from "@/layout/Avatar";
import Modal from "@/layout/Modal";
import { Vector2, OrthographicCamera, Group } from "three";
import { api } from "@/utils/api";
import { useSafePush } from "@/utils/routing";
import { PathCalculator, findHex } from "@/libs/hexgrid";
import { OrbitControls } from "@/libs/threejs/OrbitControls";
import { getBackgroundColor } from "@/libs/travel/biome";
import { cleanUp, setupScene } from "@/libs/travel/util";
import { drawSector, drawVillage, drawUsers, drawQuest } from "@/libs/travel/sector";
import { intersectUsers } from "@/libs/travel/sector";
import { intersectTiles } from "@/libs/travel/sector";
import { useRequiredUserData } from "@/utils/UserContext";
import { showMutationToast } from "@/libs/toast";
import { isLocationObjective } from "@/libs/quest";
import { RANKS_RESTRICTED_FROM_PVP } from "@/drizzle/constants";
import type { UserData } from "@/drizzle/schema";
import type { Grid } from "honeycomb-grid";
import type { GlobalTile, SectorPoint, SectorUser } from "@/libs/travel/types";
import type { TerrainHex } from "@/libs/hexgrid";
import type { SectorUsers } from "@/routers/travel";

interface SectorProps {
  sector: number;
  tile: GlobalTile;
  target: SectorPoint | null;
  showSorrounding: boolean;
  showActive: boolean;
  setShowSorrounding: React.Dispatch<React.SetStateAction<boolean>>;
  setTarget: React.Dispatch<React.SetStateAction<SectorPoint | null>>;
  setPosition: React.Dispatch<React.SetStateAction<SectorPoint | null>>;
  setHoverPosition: React.Dispatch<React.SetStateAction<SectorPoint | null>>;
}

const Sector: React.FC<SectorProps> = (props) => {
  // Incoming props
  const { sector, target, showActive } = props;
  const { setTarget, setPosition, setHoverPosition } = props;

  // State pertaining to the sector
  const [targetUser, setTargetUser] = useState<SectorUser | null>(null);
  const [moves, setMoves] = useState(0);
  const [sorrounding, setSorrounding] = useState<SectorUser[]>([]);

  // References which shouldn't update
  const origin = useRef<TerrainHex | undefined>(undefined);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const pathFinder = useRef<PathCalculator | null>(null);
  const grid = useRef<Grid<TerrainHex> | null>(null);
  const users = useRef<SectorUsers | null>(null);
  const showUsers = useRef<boolean>(showActive);
  const mouse = new Vector2();

  // Data from db
  const { data: userData, pusher, refetch: refetchUser } = useRequiredUserData();
  const { data } = api.travel.getSectorData.useQuery(
    { sector: sector },
    { enabled: sector !== undefined, staleTime: Infinity },
  );
  const fetchedUsers = data?.users;
  const villageData = data?.village;

  // Router for forwarding
  const router = useSafePush();

  // Convenience calculations
  const isInSector = userData?.sector === props.sector;

  // Background color for the map
  const { color } = getBackgroundColor(props.tile);

  // Update mouse position on mouse move
  const onDocumentMouseMove = (event: MouseEvent) => {
    if (mountRef.current) {
      const bounding_box = mountRef.current.getBoundingClientRect();
      mouse.x = (event.offsetX / bounding_box.width) * 2 - 1;
      mouse.y = -((event.offsetY / bounding_box.height) * 2 - 1);
    }
  };

  // Movement based on ASDQWE keys
  const onDocumentKeyDown = (event: KeyboardEvent) => {
    if (origin.current && pathFinder.current) {
      const x = origin.current.col;
      const y = origin.current.row;
      switch (event.key) {
        // Up & Down
        case "w":
          setTarget({ x: x, y: y + 1 });
          break;
        case "s":
          setTarget({ x: x, y: y - 1 });
          break;
        // High left & right
        case "q":
          setTarget({ x: x - 1, y: x % 2 === 0 ? y : y + 1 });
          break;
        case "e":
          setTarget({ x: x + 1, y: x % 2 === 0 ? y : y + 1 });
          break;
        // Low left & right
        case "a":
          setTarget({ x: x - 1, y: x % 2 === 0 ? y - 1 : y });
          break;
        case "d":
          setTarget({ x: x + 1, y: x % 2 === 0 ? y - 1 : y });
          break;
      }
    }
  };

  const { mutate: checkQuest } = api.quests.checkLocationQuest.useMutation({
    onSuccess: async (data) => {
      if (data.success) {
        data.notifications.forEach((notification) => {
          showMutationToast({
            success: true,
            message: notification,
          });
        });
        await refetchUser();
      }
    },
  });

  // Convenience method for updating user list
  const updateUsersList = (data: UserData) => {
    if (users.current) {
      const idx = users.current.findIndex((user) => user.userId === data.userId);
      if (idx !== -1) {
        users.current[idx] = data;
      } else {
        users.current.push(data);
      }
      // Remove users who are no longer in the sector
      (
        users.current
          .map((user, idx) => (user.sector !== props.sector ? idx : null))
          .filter((idx) => idx !== null) as number[]
      )
        .reverse()
        .map((idx) => users.current?.splice(idx, 1));
    }
    setSorrounding(users.current || []);
  };

  const { mutate: move, isPending: isMoving } = api.travel.moveInSector.useMutation({
    onSuccess: async (res) => {
      // Stop moving if failed
      if (res.success === false) {
        setTarget(null);
      }
      // If success without data, then we got attacked
      if (res.success && !res.data) {
        setTarget(null);
        showMutationToast(res);
        await refetchUser();
      }
      // If success with data, then we moved
      if (res.success && res.data) {
        const data = res.data;
        origin.current = findHex(grid.current, {
          x: data.longitude,
          y: data.latitude,
        });
        updateUsersList({
          ...userData,
          longitude: data.longitude,
          latitude: data.latitude,
          location: data.location,
        } as UserData);
        setPosition({ x: data.longitude, y: data.latitude });
        setMoves((prev) => prev + 1);
        if (data.location !== userData?.location) {
          await refetchUser();
        }
        if (userData) {
          userData?.userQuests?.forEach((userquest) => {
            userquest.quest.content.objectives.forEach((objective) => {
              if (
                // If an objective is a location objective, then check quest
                isLocationObjective(
                  {
                    sector: data.sector,
                    latitude: data.latitude,
                    longitude: data.longitude,
                  },
                  objective,
                ) ||
                // If we have attackers, check for these
                (objective.attackers &&
                  objective.attackers.length > 0 &&
                  objective.attackers_chance > 0)
              ) {
                checkQuest();
              }
            });
          });
        }
      }
    },
  });

  const { mutate: attack, isPending: isAttacking } = api.combat.attackUser.useMutation({
    onSuccess: async (data) => {
      if (data.success) {
        await refetchUser();
      } else {
        showMutationToast({
          success: false,
          message: data.message,
        });
      }
    },
  });

  useEffect(() => {
    if (pusher) {
      const channel = pusher.subscribe(props.sector.toString());
      channel.bind("event", (data: UserData) => {
        if (data.userId !== userData?.userId) updateUsersList(data);
      });
      return () => {
        pusher.unsubscribe(props.sector.toString());
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    showUsers.current = showActive;
  }, [showActive]);

  useEffect(() => {
    if (target && origin.current && pathFinder.current && userData && userData.avatar) {
      // Check user status
      if (userData.status !== "AWAKE") {
        setTarget(null);
        return;
      }
      // Get target hex
      const targetHex = grid?.current?.getHex({ col: target.x, row: target.y });
      // Guards
      if (!targetHex) return;
      if (target.x === origin.current.col && target.y === origin.current.row) return;
      // Get shortest path
      const path = pathFinder.current.getShortestPath(origin.current, targetHex);
      const next = path?.[1];
      if (next && !isMoving) {
        document.body.style.cursor = "wait";
        move({
          longitude: next.col,
          latitude: next.row,
          sector: sector,
          avatar: userData.avatar,
          villageId: userData.villageId,
          level: userData.level,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, userData, moves, sector, isMoving, move]);

  useEffect(() => {
    const sceneRef = mountRef.current;
    if (sceneRef && userData && fetchedUsers) {
      // Update the state containing sorrounding users on first load
      setSorrounding(fetchedUsers || []);
      users.current = fetchedUsers;

      // Used for map size calculations
      const hexagonLengthToWidth = 0.885;

      // Map size
      const WIDTH = sceneRef.getBoundingClientRect().width;
      const HEIGHT = WIDTH * hexagonLengthToWidth;

      // Performance monitor
      // const stats = new Stats();
      // document.body.appendChild(stats.dom);

      // Listeners
      sceneRef.addEventListener("mousemove", onDocumentMouseMove, false);
      document.addEventListener("keydown", onDocumentKeyDown, false);

      // Seeded noise generator for map gen
      const prng = alea(props.sector + 1);

      // Setup scene, renderer and raycaster
      const { scene, renderer, raycaster, handleResize } = setupScene({
        mountRef: mountRef,
        width: WIDTH,
        height: HEIGHT,
        sortObjects: false,
        color: color,
        colorAlpha: 1,
        width2height: hexagonLengthToWidth,
      });
      sceneRef.appendChild(renderer.domElement);

      // Setup camara
      const camera = new OrthographicCamera(0, WIDTH, HEIGHT, 0, -10, 10);
      camera.zoom = villageData ? 1 : 2;
      camera.updateProjectionMatrix();

      // Draw the map
      const { group_tiles, group_edges, group_assets, honeycombGrid } = drawSector(
        WIDTH,
        prng,
        villageData !== undefined,
        props.tile,
      );
      grid.current = honeycombGrid;

      // Draw any village in this sector
      if (villageData) {
        const village = drawVillage(villageData, grid.current);
        group_assets.add(village);
      }

      // Store current highlights and create a path calculator object
      pathFinder.current = new PathCalculator(grid.current);

      // Intersections & highlights from interactions
      let highlights = new Set<string>();
      let currentTooltips = new Set<string>();

      // js groups for organization
      const group_users = new Group();
      const group_quest = new Group();

      // Set the origin
      if (!origin.current) {
        origin.current = grid?.current?.getHex({
          col: userData.longitude,
          row: userData.latitude,
        });
      }

      // Enable controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableRotate = false;
      controls.zoomSpeed = 1.0;
      controls.minZoom = 1;
      controls.maxZoom = 3;

      // Set initial position of controls & camera
      if (isInSector && origin.current) {
        const { x, y } = origin.current.center;
        controls.target.set(-WIDTH / 2 - x, -HEIGHT / 2 - y, 0);
        camera.position.copy(controls.target);
      }

      // Draw quest data on the map
      drawQuest({ group_quest, user: userData, grid: grid.current });

      // Add the group to the scene
      scene.add(group_tiles);
      scene.add(group_edges);
      scene.add(group_assets);
      scene.add(group_quest);
      scene.add(group_users);

      // Capture clicks to update move direction
      const onClick = () => {
        const intersects = raycaster.intersectObjects(scene.children);
        intersects
          .filter((i) => i.object.visible)
          .every((i) => {
            if (i.object.userData.type === "tile") {
              const target = i.object.userData.tile as TerrainHex;
              setTarget({ x: target.col, y: target.row });
              return false;
            } else if (showUsers.current && i.object.userData.type === "attack") {
              const target = users.current?.find(
                (u) => u.userId === i.object.userData.userId,
              );
              if (target) {
                if (
                  target.longitude === origin.current?.col &&
                  target.latitude === origin.current?.row &&
                  !isAttacking
                ) {
                  document.body.style.cursor = "wait";
                  setTargetUser(target);
                  attack({
                    userId: target.userId,
                    longitude: target.longitude,
                    latitude: target.latitude,
                    sector: sector,
                    asset: origin.current?.asset,
                  });
                } else {
                  setTarget({ x: target.longitude, y: target.latitude });
                }
              }
              return false;
            } else if (showUsers.current && i.object.userData.type === "info") {
              const userId = i.object.userData.userId as string;
              void router.push(`/users/${userId}`);
              return false;
            } else if (showUsers.current && i.object.userData.type === "marker") {
              return false;
            }
            return true;
          });
      };
      renderer.domElement.addEventListener("click", onClick, true);

      // Render the image
      let lastTime = Date.now();
      let animationId = 0;
      let userAngle = 0;
      function render() {
        // Use raycaster to detect mouse intersections
        raycaster.setFromCamera(mouse, camera);

        // Assume we have user, users and a grid
        if (userData && users.current && grid.current) {
          // Draw all users on the map + indicators for positions with multiple users
          userAngle = drawUsers({
            group_users: group_users,
            users: showUsers.current
              ? users.current
              : users.current.filter((u) => u.userId === userData.userId),
            grid: grid.current,
            lastTime: lastTime,
            angle: userAngle,
          });
          lastTime = Date.now();

          // Draw interactions with user sprites
          currentTooltips = intersectUsers({
            group_users,
            raycaster,
            users: users.current,
            userData,
            currentTooltips,
          });
        }

        // Detect intersections with tiles for movement
        if (pathFinder.current && origin.current) {
          highlights = intersectTiles({
            group_tiles,
            raycaster,
            pathFinder: pathFinder.current,
            origin: origin.current,
            currentHighlights: highlights,
            setHoverPosition: setHoverPosition,
          });
        }

        // Trackball updates
        controls.update();

        // Render the scene
        animationId = requestAnimationFrame(render);
        renderer.render(scene, camera);
      }
      render();

      // Every time we refresh this component, fire off a move counter to make sure other useEffects are updated
      setMoves((prev) => prev + 1);

      // Remove the mouseover listener
      return () => {
        window.removeEventListener("resize", handleResize);
        document.removeEventListener("keydown", onDocumentKeyDown, false);
        sceneRef.removeEventListener("mousemove", onDocumentMouseMove);
        sceneRef.removeChild(renderer.domElement);
        cleanUp(scene, renderer);
        cancelAnimationFrame(animationId);
        void refetchUser();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.sector, isAttacking, userData?.questData, fetchedUsers]);

  return (
    <>
      <div ref={mountRef}></div>
      {props.showSorrounding && sorrounding && userData && origin.current && (
        <SorroundingUsers
          setIsOpen={props.setShowSorrounding}
          users={sorrounding}
          userId={userData.userId}
          hex={origin.current}
          attackUser={(userId) => {
            const target = sorrounding.find((u) => u.userId === userId);

            if (target && !isAttacking) {
              attack({
                userId: target.userId,
                longitude: target.longitude,
                latitude: target.latitude,
                sector: sector,
                asset: origin.current?.asset,
              });
            }
          }}
        />
      )}
      {targetUser && (isAttacking || userData?.status === "BATTLE") && (
        <div className="absolute bottom-0 left-0 right-0 top-0 z-20 m-auto flex flex-col justify-center bg-black">
          <div className="m-auto text-center text-white">
            <p className="p-5  text-3xl">
              <AvatarImage
                href={targetUser.avatar}
                userId={targetUser.userId}
                alt={targetUser.username}
                size={256}
                priority
              />
            </p>
            <p className="text-5xl">Attacking {targetUser.username}</p>
          </div>
        </div>
      )}
    </>
  );
};

export default Sector;

interface SorroundingUsersProps {
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  userId: string;
  hex: TerrainHex;
  users: SectorUser[];
  attackUser: (userId: string) => void;
}

const SorroundingUsers: React.FC<SorroundingUsersProps> = (props) => {
  const users = props.users.filter(
    (user) =>
      user.latitude === props.hex.row &&
      user.longitude === props.hex.col &&
      user.userId !== props.userId,
  );
  return (
    <Modal title="Sorrounding Area" setIsOpen={props.setIsOpen} isValid={false}>
      <div className="grid grid-cols-3 gap-4 text-center sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-10">
        {users.map((user, i) => (
          <div key={i} className="relative">
            <div className="absolute right-0 top-0 z-50 w-1/3 hover:opacity-80">
              {!RANKS_RESTRICTED_FROM_PVP.includes(user.rank) && (
                <Image
                  src={"/map/attack.png"}
                  onClick={() => props.attackUser(user.userId)}
                  width={40}
                  height={40}
                  alt={`Attack-${user.userId}`}
                />
              )}
            </div>
            <div className="absolute left-0 top-0 z-50 w-1/3 hover:opacity-80">
              <Link href={`/users/${user.userId}`}>
                <Image
                  src={"/map/info.png"}
                  width={40}
                  height={40}
                  alt={`Info-${user.userId}`}
                />
              </Link>
            </div>
            <div className="p-3">
              <AvatarImage
                href={user.avatar}
                userId={user.userId}
                alt={user.username}
                size={512}
                priority
              />
            </div>
            <p>{user.username}</p>
            <p className="text-white ">Level. {user.level}</p>
          </div>
        ))}
      </div>
    </Modal>
  );
};

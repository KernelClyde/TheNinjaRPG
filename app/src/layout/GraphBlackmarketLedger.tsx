import React from "react";
import { api } from "@/utils/api";
import { getUnique } from "@/utils/grouping";
import Loader from "@/layout/Loader";
import GraphUsersGeneric from "@/layout/GraphUsersGeneric";

interface GraphBlackmarketLedgerProps {}
const GraphBlackmarketLedger: React.FC<GraphBlackmarketLedgerProps> = () => {
  // Queries
  const { data, isPending } = api.blackmarket.getGraph.useQuery(undefined, {
    staleTime: Infinity,
  });

  if (!data || isPending) return <Loader explanation="Loading black market ledger" />;

  // Wrangling a bit
  const users =
    data
      .filter((x) => x.receiverId)
      .flatMap((x) => [
        { id: x.senderId, label: x.senderUsername, img: x.senderAvatar },
        { id: x.receiverId, label: x.receiverUsername, img: x.receiverAvatar },
      ])
      .filter((x) => x) || [];
  const nodes = getUnique(users, "id");
  const edges = data.flatMap((x) => [
    {
      source: x.senderId,
      target: x.receiverId,
      label: `${x.totalReps} reps`,
      weight: x.totalReps,
    },
    {
      source: x.receiverId,
      target: x.senderId,
      label: `${x.totalRyo} ryo`,
      weight: Math.log(x.totalRyo),
    },
  ]);

  return <GraphUsersGeneric nodes={nodes} edges={edges} />;
};

export default GraphBlackmarketLedger;
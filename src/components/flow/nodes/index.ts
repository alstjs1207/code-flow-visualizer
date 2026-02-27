import type { NodeTypes } from "@xyflow/react";
import { EntryNode } from "./EntryNode";
import { ConditionNode } from "./ConditionNode";
import { ActionNode } from "./ActionNode";
import { ErrorNode } from "./ErrorNode";
import { ReturnNode } from "./ReturnNode";

export const nodeTypes: NodeTypes = {
  entry: EntryNode,
  validation: ConditionNode,
  condition: ConditionNode,
  action: ActionNode,
  error: ErrorNode,
  return: ReturnNode,
};

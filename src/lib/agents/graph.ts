import { StateGraph, END } from '@langchain/langgraph';
import { AgentState, type AgentStateType } from './types';
import { judgeAgent } from './judge-agent';
import { routerAgent } from './router-agent';
import { creatorAgent } from './creator-agent';
import type { Logger } from '../logging/logger';

/**
 * AGENT PIPELINE GRAPH
 *
 * This is the "flowchart" that connects all our agents:
 *
 * START → Judge → Router → Creator → END
 *
 * Each agent:
 * 1. Reads from state (the shared "notebook")
 * 2. Does its work (calls LLM, generates content, etc.)
 * 3. Writes results back to state
 * 4. Passes state to next agent
 *
 * The graph automatically handles:
 * - Passing state between agents
 * - Error recovery
 * - Conditional routing (if judge finds no ideas, skip to END)
 */

/**
 * Create and compile the agent graph
 */
export function createAgentGraph() {
  // Create the graph with our state schema
  const workflow = new StateGraph(AgentState);

  // Add nodes (agents)
  workflow
    .addNode('judge', judgeAgent)
    .addNode('router', routerAgent)
    .addNode('creator', creatorAgent);

  // Define edges (connections between agents)

  // Set entry point (where the graph starts)
  // @ts-expect-error - LangGraph types don't properly infer node names
  workflow.addEdge('__start__', 'judge');

  // Simple linear flow for now (can add conditionals later)
  // @ts-expect-error - LangGraph types don't properly infer node names
  workflow.addEdge('judge', 'router');
  // @ts-expect-error - LangGraph types don't properly infer node names
  workflow.addEdge('router', 'creator');

  // Set finish point (where the graph ends)
  // @ts-expect-error - LangGraph types don't properly infer node names
  workflow.addEdge('creator', '__end__');

  // Compile the graph
  return workflow.compile();
}

/**
 * Execute the full agent pipeline
 *
 * This is the main entry point to run the workflow.
 *
 * @param userId - User ID
 * @param allIdeas - All pending ideas to evaluate
 * @param specificIdeaId - Optional: specific idea to expand (for manual trigger)
 * @param executionId - Unique ID for this execution (for logging)
 * @param logger - Logger instance for tracking execution
 * @returns Final state with all results
 */
export async function runAgentPipeline({
  userId,
  allIdeas,
  specificIdeaId = null,
  executionId,
  logger,
}: {
  userId: string;
  allIdeas: any[];
  specificIdeaId?: string | null;
  executionId: string;
  logger: Logger;
}): Promise<AgentStateType> {
  // Create the graph
  const graph = createAgentGraph();

  // Create child logger for graph orchestration
  const graphLogger = logger.child({ stage: 'graph-orchestrator' });

  // Initial state
  const initialState = {
    userId,
    allIdeas,
    specificIdeaId,
    executionId,
    logger,
  } as Partial<AgentStateType>;

  graphLogger.info('🚀 Starting agent pipeline', {
    userId,
    ideaCount: allIdeas.length,
    specificIdeaId: specificIdeaId || 'None (will judge all)',
  });

  // Run the graph!
  const finalState = await graph.invoke(initialState);

  graphLogger.info('✅ Agent pipeline complete', {
    selectedIdea: finalState.selectedIdea?.title || 'None',
    chosenFormat: finalState.chosenFormat || 'None',
    contentGenerated: !!finalState.generatedContent,
    tokensUsed: finalState.tokensUsed,
    errorCount: finalState.errors.length,
    durationMs: graphLogger.getDuration(),
  });

  return finalState;
}

import { defineServerModule } from "@aihot/backend/modules";
import { researchBatches,radarOverview } from "@aihot/backend/publication/radar";
import {eventHandoff} from './handoff.ts';
export default defineServerModule({name:"game-radar",http(app){
  app.get<{Params:{batch:string;event:string}}>("/api/site/radar/batches/:batch/events/:event/handoff",async(req,reply)=>{
    const batch=(await researchBatches()).find(b=>b.run.id===req.params.batch),event=batch?.events.find(e=>e.id===req.params.event);
    if(!batch||!event)return reply.code(404).send({code:'not_found'});
    reply.header('Cache-Control','no-store').header('Content-Disposition',`attachment; filename="starrail-handoff-${batch.run.id}-${event.id}.json"`);
    return eventHandoff(batch,event);
  });
  app.get("/api/site/radar/overview",async (_req,reply)=>{reply.header("Cache-Control","no-store");return radarOverview();});
  app.get("/api/site/radar/batches",async (_req,reply)=>{reply.header("Cache-Control","no-store");return {batches:await researchBatches()};});
  app.get<{Params:{id:string}}>("/api/site/radar/batches/:id/export",async (req,reply)=>{
    const batch=(await researchBatches()).find(b=>b.run.id===req.params.id);
    if(!batch) return reply.code(404).send({code:"not_found"});
    reply.header("Cache-Control","no-store").header("Content-Disposition",`attachment; filename="game-radar-${batch.run.id}.json"`);
    return batch;
  });
}});

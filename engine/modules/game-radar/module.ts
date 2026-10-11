import { defineModule } from "@aihot/contracts/modules";
export default defineModule({name:"game-radar",pages:[{path:"research",file:"web/research.tsx",id:"radar-research"},{path:"materials",file:"web/materials.tsx",id:"radar-materials"},{path:"featured",file:"web/feed.tsx",id:"radar-featured"}],apiPaths:[/^\/api\/site\/radar(?:\/|$)/]});

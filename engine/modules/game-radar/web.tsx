import { defineWebModule } from "@aihot/web/modules";
import { IconHistory,IconList,IconHeart,IconGrid } from "@aihot/web/components/icons";
export default defineWebModule({name:"game-radar",sidebar:{section:"游戏资讯",items:[{to:"/",label:"首页",icon:IconGrid,end:true},{to:"/all",label:"全部动态",icon:IconList},{to:"/featured",label:"精选",icon:IconHeart},{to:"/research",label:"事件雷达",icon:IconHistory},{to:"/materials",label:"材料记录",icon:IconList}]}});

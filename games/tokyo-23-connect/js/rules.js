(function(root){
  const Rules={
    canMerge(a,b,wards,contact){return !a.some(id=>b.includes(id))&&(contact
      ? a.includes(contact[0])&&b.includes(contact[1])&&wards[contact[0]].neighbors.includes(contact[1])
      : a.some(id=>wards[id].neighbors.some(n=>b.includes(n))));},
    complete(ids){return new Set(ids).size===23;},
    neighborChance(remaining){return remaining>=20?.9:remaining>=15?.8:remaining>=10?.7:remaining>=5?.6:.5;},
    wardOrder(wards,rng=Math.random){
      const remaining=wards.map(w=>w.id),order=[];
      while(remaining.length){
        let candidates;
        if(!order.length){candidates=remaining.filter(id=>[0,1,2,3,4,12].includes(id));}
        else{
          const neighbors=wards[order[order.length-1]].neighbors;
          const preferNeighbor=rng()<Rules.neighborChance(remaining.length);
          candidates=remaining.filter(id=>neighbors.includes(id)===preferNeighbor);
        }
        if(!candidates.length)candidates=remaining;
        const id=candidates[Math.floor(rng()*candidates.length)];
        order.push(id);remaining.splice(remaining.indexOf(id),1);
      }
      return order;
    },
    overflow(bounds,age,grace){return age>1500&&grace<=0&&bounds.min.y<116;},
    escaped(topYs,entered,rim=126){return entered&&Math.max(...topYs)<rim;},
    shuffled(ids,rng=Math.random){const bag=[...ids];for(let i=bag.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}return bag;}
  };if(typeof module!=='undefined')module.exports=Rules;else root.Rules=Rules;
})(globalThis);

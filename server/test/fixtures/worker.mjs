// Child process of the lock test: appends N ids to savedIds, each in its own locked read-modify-write.
import { updateKitchen } from '../../store.mjs';

const [name, count] = process.argv.slice(2);
for (let i = 0; i < Number(count); i++) updateKitchen((state) => { state.savedIds.push(`${name}-${i}`); return state; });

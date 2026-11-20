import { Tag } from '../../../assets/engine/Tag';
import { MonoBehaviour } from '../../../assets/engine/MonoBehaviour';
import { RequireComponent, Serializable, SerializeField } from '../../../assets/engine/decorators';

@Serializable
export class Stats {
    @SerializeField
    speed = 1;
}

@Serializable('fixture.NamedData')
export class Named {
    @SerializeField
    label = '';
}

@Serializable
export class Loot {
    @SerializeField
    gold = 0;
}

/** One component in the file; it requires a Tag. */
@Serializable
@RequireComponent(Tag)
export class DataClasses extends MonoBehaviour {
    @SerializeField(Stats)
    stats: Stats = new Stats();

    @SerializeField([Loot])
    loot: Loot[] = [];
}

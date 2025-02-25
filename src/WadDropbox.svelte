<script lang="ts">
    import { fly } from "svelte/transition";
    import type { WADInfo, WadStore } from "./WadStore";
    import { Icon } from '@steeze-ui/svelte-icon'
    import { ExclamationTriangle } from '@steeze-ui/heroicons'

    export let wadStore: WadStore;
    const wads = wadStore.wads;

    $: haveIWads = $wads.filter(wad => wad.iwad).length > 0;

    const messageTime = 4000;
    let toastMessageId = 0;
    let toastMessages = [];
    function toastMessage(message: string, time: number) {
        toastMessages.push({ message, time, id: toastMessageId++ });
        toastMessages = toastMessages;
    }

    let wadFiles: FileList;
    $: if (wadFiles) {
        // store files in wad store
        for (const file of wadFiles) {
            file.arrayBuffer().then(buff => {
                const info  = wadStore.saveWad(file.name, buff);
                toastMessage(`${info.name} added (${info.iwad ? 'IWAD' : 'PWAD'})`, messageTime);
            });
        }
    }

    function detailsString(wad: WADInfo) {
        return [
            `${wad.mapCount} maps`,
            (wad.episodicMaps ? '(episodic)' : null),
            (wad.iwad ? '[iwad]' : '[pwad]'),
        ].filter(e => e).join(' ');
    }

    // https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop
    let fileDropActive = false;
    function fileDropHandler(ev: DragEvent) {
        fileDropActive = false;
        if (ev.dataTransfer.items) {
            // Use DataTransferItemList interface to access the file(s)
            Promise.all([...ev.dataTransfer.items].map(async item => {
                if (item.kind === "file") {
                    const file = item.getAsFile();
                    const info = wadStore.saveWad(file.name, await file.arrayBuffer());
                    toastMessage(`${info.name} added (${info.iwad ? 'IWAD' : 'PWAD'})`, messageTime);
                }
            }));
        } else {
            // Use DataTransfer interface to access the file(s)
            [...ev.dataTransfer.files].forEach(async (file, i) => {
                const info = wadStore.saveWad(file.name, await file.arrayBuffer());
                toastMessage(`${info.name} added (${info.iwad ? 'IWAD' : 'PWAD'})`, messageTime);
            });
        }
    }
</script>

<div class="collapse collapse-arrow bg-base-300"
    class:collapse-arrow={haveIWads}
    class:collapse-open={!haveIWads}
>
    <input type="checkbox" />
    <div class="collapse-title text-center text-xl font-medium">
      Manage WADs
    </div>
    <div class="collapse-content z-0">
        {#if $wads.length}
        <label class="swap swap-flip">
            <input type="checkbox" />
            <div class="swap-off btn btn-secondary">Remove All</div>
            <div class="swap-on fill-current alert alert-warning">
                <span><Icon src={ExclamationTriangle} theme='outline' size="1.5rem" /></span>
                <span>Remove All: Are you sure?</span>
                <div>
                    <button class="btn" on:click={() => $wads.forEach(wad => wadStore.removeWad(wad.name))}>Yes</button>
                    <span class="btn">No</span>
                </div>
            </div>
        </label>
        {/if}
        <div class="grid grid-cols-2 lg:grid-cols-3 gap-2 max-h-80 overflow-scroll">
            {#each $wads as wad (wad.name)}
                <div class="card image-full card-compact">
                    <figure><img src={wad.image} alt="" /></figure>
                    <div class="card-body justify-end">
                        <h2 class="card-title">{wad.name}
                        <span class="text-xs">{detailsString(wad)}</span></h2>
                        <div class="card-actions justify-end">
                            <label class="swap swap-flip">
                                <input type="checkbox" />
                                <div class="swap-off btn btn-secondary">Remove</div>
                                <div class="swap-on fill-current alert alert-warning h-0">
                                    <span><Icon src={ExclamationTriangle} theme='outline' size="1.5rem" /></span>
                                    <span>Remove: Are you sure?</span>
                                    <div>
                                        <button class="btn" on:click={() => wadStore.removeWad(wad.name)}>Yes</button>
                                        <span class="btn">No</span>
                                    </div>
                                </div>
                            </label>
                        </div>
                    </div>
                </div>
            {/each}
        </div>

        <div class="
            flex flex-col items-center justify-center
            border-2 border-accent border-dashed
            rounded-lg cursor-pointer m-2 p-2
        "
            class:border-3={fileDropActive}
            class:border-primary={fileDropActive}
            class:bg-base-300={fileDropActive}
            class:dragging={fileDropActive}
            role="button"
            tabindex="0"
            on:drop|preventDefault={fileDropHandler}
            on:dragover|preventDefault
            on:dragenter={() => fileDropActive = true}
            on:dragleave={() => fileDropActive = false}
        >
            <label class="label gap-1" for="wad-file-drop">
                <span>
                Load a <a class="link link-primary" class:disable-pointer={fileDropActive} target="_blank" rel="noreferrer" href="https://zdoom.org/wiki/IWAD">DOOM WAD</a>
                file by dropping it here or <span class="btn btn-primary">Browse...</span> for files.
                </span>
                <input class="file-input hidden" type="file" id="wad-file-drop" name="wad-file-drop" multiple bind:files={wadFiles}>
            </label>
            <span class="text-xs">
                WAD files ARE NOT uploaded to a server. WADs are stored in your browser
                (in <a class="link link-primary" href="https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API" target="_black" rel="noreferrer">IndexedDB</a>)
                and only used while playing DOOM.
            </span>
        </div>
    </div>
</div>

<div class="toast">
    {#each toastMessages as tm (tm.id)}
        <div out:fly={{ x: 20, delay: tm.time }}>
            <div class="alert alert-info"
                in:fly={{ x: 20 }}
                on:introend={() => toastMessages = toastMessages.filter(m => m !== tm)}
            >{tm.message}</div>
        </div>
    {/each}
</div>

<style>
    .swap-on {
        height: 0;
    }
    .swap-flip input:checked ~ .swap-on {
        height: auto;
    }

    .dragging * {
        pointer-events: none;
    }
</style>
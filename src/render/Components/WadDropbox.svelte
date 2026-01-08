<script lang="ts">
    import { fly } from "svelte/transition";
    import { WadStore } from "../../WadStore";

    export let wadStore: WadStore;

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

<div class="
        flex flex-col items-center justify-center gap-4 text-center h-full
        border-2 border-accent border-dashed
        rounded-lg cursor-pointer p-2
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
    <label class="label md:text-lg" for="wad-file-drop">
        <span>
        Load a <a class="link link-primary" class:disable-pointer={fileDropActive} target="_blank" rel="noreferrer" href="https://zdoom.org/wiki/IWAD">DOOM WAD</a>
        file by dropping it here or <span class="btn btn-primary">Browse...</span> for files.
        </span>
        <input class="file-input hidden" type="file" id="wad-file-drop" name="wad-file-drop" multiple bind:files={wadFiles}>
    </label>
    <span class="text-xs max-w-md">
        WAD files are NOT uploaded to a server. WADs are stored in your browser
        (in <a class="link link-primary" href="https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API" target="_blank" rel="noreferrer">IndexedDB</a>)
        and only used while playing DOOM.
    </span>
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
    .dragging * {
        pointer-events: none;
    }
</style>
# Prioritzed Features

See the brainstorming section for the full description of what each of these ideas actually entails.

* Audio Recording
* Normalization
* Scripts
* Multiline Editing
* Staging Area

# Brainstorming

## Multichannel Audio

I'm wondering if there are any places in the codebase where we're intentionally ignoring
multi-channel audio and only using the L/Mono channel?
Maybe sn.read() does this?
Would be nice to support multi-channel audio but it feels like it could be a big lift.

## Staging Area

The idea here would be that the audio stored in the main Bounce database is just stuff that the user
has elected to store from a given session, and that maybe a lot of the audio generated during a
session is ok to throw away when the application is closed. Maybe by default audio is always stored
to this temporary staging area and is only written to the main database when the user wants this.
One problem with this idea though is that users should be able to close Bounce and resume their
previous session. It might be surprising to users that work gets thrown away automatically
unless you explicitly save it to the main database.
We would need to think through how the provenance would work in this case, because
with just one database (which is how the application currently works) we can use the features_links
table to link samples with features, and in the case where a feature generates new samples
e.g. OnsetSlice, we can trace the lineage of each slice back to the source sample.
In a sense, this means that there is no such thing as destructive editing in Bounce.
But this also means that if we were going to require users to move a sample from their staging
area to the permanent storage, it raises the question of would we copy the entire lineage to
maintain that?
Probably not...
Maybe the main database is _just_ for audio?

I was thinking more about this feature last night.
I was thinking how it's cool that we keep track of lineage for derived samples, but that
sometimes the user might want to throw away the history and _just_ keep the resulting sample.
Maybe this is an option that people could use when they copy samples from the session to
the project? If this option is turned on, then the sample appears in the project db
as a raw sample.
Maybe this is actually how the copy should work by default?
Maybe we don't care about tracking lineage for samples that get moved into a project?

## Multiline Editing

I know that this does not work very well right now.
We should take a look at making it work better!

## Scripts

It would be cool if users had a way to define their own scripts and invoke these
from the REPL.
This would probably mean that we need to define a javascript editor interface.
Could be cool, but feels like a big lift!

## Normalization

I would like to be able to normalize a sample!
There may be some other kinds of gain adjustments we could apply.

## Sample Lineage

We already store samples and features in a way that would allow us to track lineage.
e.g. raw sample -> feature1, feature2 -> derived sample
This feature would just expose that through the UI somehow.

## Tutorials

I think interactive tutorials could be cool!
Maybe it's a `tutorial()` global function to learn the global functions.
Then each global object could expose a tutorial() method to educate the user
about how to use that object.
Each tutorial would run in a temp directory and temp db, to sandbox everything the
user does. When they exit the tutorial, everything they did is removed.
I think that seems right?
It could be kinda sad if someone did something they actually wanted to save
while in a tutorial session, but couldn't :(
Once you start a tutorial, there are globals added to the bounce REPL:
* next() goes to the next page in the tutorial
* prev() goes back to the previous page in the tutorial
* quit() exits the tutorial and deletes everything in the sandbox environment

## Freesound Integration

* Searching sounds from freesound.org
* Downloading sounds
* How do we honor the sound's license?
  * We would need to track that a sound is downloaded from freesound, and store the URL
  * Could prob fetch the license info from the URL?
  * Ability to generate an attribution document
  
## Ableton Link Integration

* Prob comes after migrating all audio playback/voicing to a dedicated utility
  process that runs a realtime audio thread.
* What could we do with this?
  * Sync to DAW
  * Sync sample playback to transport?

# Cleanup Tasks

* sn.help() output sucks. We should enforce a consistent approach for the help() output of all top-level objects.
* clearDebug() is still exposed through tab-completion.
* vis builder pattern doesn't support tab completion for chained method calls.
* Need to be able to do things like vis.waveform(sn.read(PATH)) i.e. shouldn't have to assign sn.read(PATH) to a variable

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'

import { AppSettings, useSettings, useSettingsDispatch } from '../context/SettingsContext'
import { useOutgoingNostrEvents } from '../context/NostrEventsContext'
import { useGameStore } from '../context/GameEventStoreContext'

import Chessboard from '../components/chessground/Chessground'
import PgnTable from '../components/chessground/PgnTable'
import { SelectedBot } from '../components/BotSelector'
import { CreateGameAndRedirectButton } from '../components/CreateGameButton'
import { GenerateRandomIdentityButton } from '../components/IdentityButtons'
import { ChessInstance } from '../components/ChessJsTypes'

import * as NIP01 from '../util/nostr/nip01'
import * as NostrEvents from '../util/nostr/events'
import * as JesterUtils from '../util/jester'
import { JesterMove, GameStart, GameMove } from '../util/jester'
import * as AppUtils from '../util/app'
import * as Bot from '../util/bot'
import { getSession } from '../util/session'
// @ts-ignore
import * as Chess from 'chess.js'
import * as cg from 'chessground/types'
import { GameMoveEvent } from '../util/app_db'
import { CopyButtonWithConfirmation } from './CopyButton'
import useWindowDimensions from '../hooks/WindowDimensions'

// @ts-ignore
import Icon from '@material-tailwind/react/Icon'
// @ts-ignore
import Input from '@material-tailwind/react/Input'
// @ts-ignore
import Button from '@material-tailwind/react/Button'
// @ts-ignore
import Popover from '@material-tailwind/react/Popover'
// @ts-ignore
import PopoverContainer from '@material-tailwind/react/PopoverContainer'
// @ts-ignore
import PopoverHeader from '@material-tailwind/react/PopoverHeader'
// @ts-ignore
import PopoverBody from '@material-tailwind/react/PopoverBody'
// @ts-ignore
import Tooltips from '@material-tailwind/react/Tooltips'
// @ts-ignore
import TooltipsContent from '@material-tailwind/react/TooltipsContent'
// @ts-ignore
import Small from '@material-tailwind/react/Small'

type MovableColor = [] | [cg.Color] | ['white', 'black']
const MOVE_COLOR_NONE: MovableColor = []
const MOVE_COLOR_WHITE: MovableColor = ['white']
const MOVE_COLOR_BLACK: MovableColor = ['black']
// const MOVE_COLOR_BOTH: MovableColor = ['white', 'black']

const MIN_LOADING_INDICATOR_DURATION_IN_MS = 750
const MAX_LOADING_INDICATOR_DURATION_IN_MS = process.env.NODE_ENV === 'development' ? 3_000 : 5_000

const titleMessage = (game: ChessInstance, color: MovableColor) => {
  if (game.game_over()) {
    if (game.in_draw()) {
      return 'Draw'
    }
    return 'Game Over'
  } else {
    if (color.length !== 1) {
      return `${game.turn() === 'w' ? 'White' : 'Black'} to move`
    }
    if (color[0].charAt(0) === game.turn()) {
      return `Your turn`
    } else {
      return `Waiting for opponent`
    }
  }
}

interface BoardContainerProps {
  game: ChessInstance
  color: MovableColor
  onGameChanged: (game: ChessInstance) => void
}

function BoardContainer({ game, color, onGameChanged }: BoardContainerProps) {
  const { height, width } = useWindowDimensions()

  const updateGameCallback = useCallback(
    (modify: (g: ChessInstance) => void) => {
      console.debug('[Chess] updateGameCallback invoked')
      const copyOfGame = { ...game }
      modify(copyOfGame)
      onGameChanged(copyOfGame)
    },
    [game, onGameChanged]
  )

  const minSize = 240 // minimal screen size, e.g. smart watches
  const maxSize = 600
  const scrollbarSpacing = 13 * 2
  const size = Math.min(maxSize, Math.max(minSize, Math.min(height * 0.75, width - scrollbarSpacing)))

  return (
    <>
      <div>
        <div
          style={{
            minWidth: minSize,
            minHeight: minSize,
            width: size,
            height: size,
            maxWidth: maxSize,
            maxHeight: maxSize,
          }}
        >
          {<Chessboard game={game} userColor={color} onAfterMoveFinished={updateGameCallback} />}
        </div>
        {false && game && (
          <div className="pl-2 overflow-y-scroll">
            <PgnTable game={game} />
          </div>
        )}
      </div>
    </>
  )
}

const CopyGameUrlInput = ({ value }: { value: string }) => {
  return (
    <div>
      <div className="flex items-center">
        <Input
          type="text"
          color="lightBlue"
          size="md"
          outline={true}
          value={value}
          placeholder="Link to Game"
          readOnly={true}
          style={{ color: 'currentColor' }}
        />
        <CopyButtonWithConfirmation
          className="h-11 mx-1 px-4 flex items-center justify-center gap-1 font-bold outline-none uppercase tracking-wider focus:outline-none focus:shadow-none transition-all duration-300 rounded-lg text-xs leading-normal text-white bg-blue-gray-500 hover:bg-blue-gray-700 focus:bg-blue-gray-400 active:bg-blue-gray-800 shadow-md-blue-gray hover:shadow-lg-blue-gray"
          value={value}
          text="Copy"
          successText="Copied"
          disabled={!value}
        />
      </div>
      <div className="flex justify-center my-1">
        <Small color="amber">Share this link with anyone to join in!</Small>
      </div>
    </div>
  )
}

const BotMoveSuggestions = ({ game }: { game: ChessInstance | null }) => {
  const settings = useSettings()

  const [selectedBot] = useState<SelectedBot>(
    (() => {
      if (settings.botName && Bot.Bots[settings.botName]) {
        return {
          name: settings.botName,
          move: Bot.Bots[settings.botName](),
        }
      }
      return null
    })()
  )

  const [isThinking, setIsThinking] = useState(false)
  const [thinkingFens, setThinkingFens] = useState<Bot.Fen[]>([])
  const [latestThinkingFen, setLatestThinkingFen] = useState<Bot.Fen | null>(null)
  const [move, setMove] = useState<Bot.ShortMove | null>(null)
  const [gameOver, setGameOver] = useState<boolean>(game?.game_over() || false)

  useEffect(() => {
    if (game === null) return

    if (game.game_over()) {
      setGameOver(true)
      return
    }

    const currentFen = game.fen()
    setThinkingFens((currentFens) => {
      if (currentFens[currentFens.length - 1] === currentFen) {
        return currentFens
      }
      return [...currentFens, currentFen]
    })
  }, [game])

  useEffect(() => {
    if (!selectedBot) return
    if (isThinking) return
    if (thinkingFens.length === 0) return

    const thinkingFen = thinkingFens[thinkingFens.length - 1]

    const timer = setTimeout(() => {
      const inBetweenUpdate = thinkingFen !== thinkingFens[thinkingFens.length - 1]
      if (inBetweenUpdate) return

      setIsThinking(true)
      setLatestThinkingFen(thinkingFen)
      console.log(`Asking bot ${selectedBot.name} for move suggestion to ${thinkingFen}...`)

      selectedBot.move(thinkingFen).then(({ from, to }: Bot.ShortMove) => {
        console.log(`Bot ${selectedBot.name} found move from ${from} to ${to}.`)

        setMove({ from, to })

        setIsThinking(false)
        setThinkingFens((currentFens) => {
          const i = currentFens.indexOf(thinkingFen)
          if (i < 0) {
            return currentFens
          }

          const copy = [...currentFens]
          // remove all thinking fens that came before this
          copy.splice(0, i + 1)
          return copy
        })
      })
    }, 100)

    return () => {
      clearTimeout(timer)
    }
  }, [selectedBot, thinkingFens, isThinking])

  if (!selectedBot) {
    return <>No bot selected.</>
  }

  return (
    <>
      {`${selectedBot.name}`}
      {gameOver ? (
        ` is ready for the next game.`
      ) : (
        <>
          {!isThinking && !move && thinkingFens.length === 0 && ` is idle...`}
          {isThinking && thinkingFens.length > 0 && ` is thinking (${thinkingFens.length})...`}
          {!isThinking && move && ` suggests ${JSON.stringify(move)}`}
          {/*Latest Thinking Fen: {latestThinkingFen}*/}
        </>
      )}
    </>
  )
}

const GameOverMessage = ({ game }: { game: ChessInstance }) => {
  if (!game.game_over()) {
    return <></>
  }

  if (game.in_stalemate()) {
    return <>Stalemate</>
  }
  if (game.in_threefold_repetition()) {
    return <>Threefold repetition</>
  }
  if (game.insufficient_material()) {
    return <>Insufficient material</>
  }

  if (game.in_draw()) {
    return <>Draw</>
  }

  return <>{`${game.turn() === 'b' ? 'White' : 'Black'} won`}</>
}

const ColorMessage = ({ color }: { color: MovableColor }) => {
  return (
    <div>
      <h6 className="text-blue-gray-500 text-3xl font-serif font-bold mt-0 mb-0">
        {`You are ${color.length === 0 ? 'in watch-only mode' : color}`}
      </h6>
    </div>
  )
}

const GameStateMessage = ({
  isLoading,
  game,
  color,
}: {
  isLoading: boolean
  game: ChessInstance | null
  color: MovableColor
}) => {
  return (
    <div>
      <h6 className="text-blue-gray-500 text-3xl font-serif font-bold mt-0 mb-0">
        {isLoading && game === null && 'Loading...'}
        {isLoading && game !== null && 'Loading...'}
        {!isLoading && game !== null && titleMessage(game, color)}
        {!isLoading && game === null && '...'}
      </h6>
    </div>
  )
}

function ProposeTakebackButton({ disabled }: { disabled: boolean }) {
  const buttonRef = useRef()

  return (
    <>
      <Button className="w-8 mx-4" color="" ref={buttonRef} ripple="light" disabled={disabled}>
        <Icon name="undo" size="xl" />
      </Button>
      <Tooltips placement="top" ref={buttonRef}>
        <TooltipsContent>Propose a takeback</TooltipsContent>
      </Tooltips>

      <Popover placement="bottom" ref={buttonRef}>
        <PopoverContainer>
          <PopoverHeader>Propose a takeback</PopoverHeader>
          <PopoverBody>Proposing to take back your move is not yet implemented.</PopoverBody>
        </PopoverContainer>
      </Popover>
    </>
  )
}
function ResignButton({ disabled }: { disabled: boolean }) {
  const buttonRef = useRef()

  return (
    <>
      <Button className="w-8 mx-4" color="" ref={buttonRef} ripple="light" disabled={disabled}>
        <Icon name="cancel" size="xl" />
      </Button>
      <Tooltips placement="top" ref={buttonRef}>
        <TooltipsContent>Resign</TooltipsContent>
      </Tooltips>

      <Popover placement="bottom" ref={buttonRef}>
        <PopoverContainer>
          <PopoverHeader>Resign</PopoverHeader>
          <PopoverBody>Don't resign! It is not yet implemented, keep playing!</PopoverBody>
        </PopoverContainer>
      </Popover>
    </>
  )
}

function OfferDrawButton({ disabled }: { disabled: boolean }) {
  const buttonRef = useRef()

  return (
    <>
      <Button className="w-8 mx-4" color="" ref={buttonRef} ripple="light" disabled={disabled}>
        <Icon name="handshake" size="xl" />
      </Button>
      <Tooltips placement="top" ref={buttonRef}>
        <TooltipsContent>Offer Draw</TooltipsContent>
      </Tooltips>

      <Popover placement="bottom" ref={buttonRef}>
        <PopoverContainer>
          <PopoverHeader>Offer Draw</PopoverHeader>
          <PopoverBody>Offering a draw is not yet impelemented.</PopoverBody>
        </PopoverContainer>
      </Popover>
    </>
  )
}

const LoadingBoard = ({ color }: { color: MovableColor }) => {
  const [game] = useState<ChessInstance>(new Chess.Chess())
  const onGameChanged = useCallback(() => {}, [])

  return (
    <div style={{ filter: 'grayscale()' }}>
      {<BoardContainer game={game} color={color} onGameChanged={onGameChanged} />}
    </div>
  )
}

interface GameboardWithLoaderProps {
  game: ChessInstance | null
  color: MovableColor
  isLoading: boolean
  isSearchingHead: boolean
  onChessboardChanged: (chessboard: ChessInstance) => Promise<void>
}

function GameboardWithLoader({
  game,
  color,
  isLoading,
  isSearchingHead,
  onChessboardChanged,
}: GameboardWithLoaderProps) {
  return (
    <>
      {(isLoading || (!isLoading && game === null)) && (
        <LoadingBoard color={color.length === 1 ? color : MOVE_COLOR_WHITE} />
      )}
      {game !== null && (
        <>
          {/* it's important that these elements are present in the DOM to avoid flickering */}
          <div style={{ display: isLoading ? 'none' : 'block' }}>
            <div style={{ display: isSearchingHead ? 'block' : 'none' }}>
              <LoadingBoard color={color.length === 1 ? color : MOVE_COLOR_WHITE} />
            </div>
            <div style={{ display: isSearchingHead ? 'none' : 'block' }}>
              <BoardContainer game={game} color={color} onGameChanged={onChessboardChanged} />
            </div>
          </div>
        </>
      )}
    </>
  )
}

function GameStartOrNewIdentityButton({ hasPrivateKey }: { hasPrivateKey: boolean }) {
  const createNewGameButtonRef = useRef<HTMLButtonElement>(null)
  const generateRandomIdentityButtonRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      {hasPrivateKey ? (
        <>
          <Button
            color="green"
            buttonType="filled"
            size="regular"
            rounded={false}
            block={false}
            iconOnly={false}
            ripple="light"
            ref={createNewGameButtonRef}
            disabled={!hasPrivateKey}
          >
            Start new game
            <CreateGameAndRedirectButton buttonRef={createNewGameButtonRef} />
          </Button>
        </>
      ) : (
        <>
          <Button
            color="deepOrange"
            buttonType="filled"
            size="regular"
            rounded={false}
            block={false}
            iconOnly={false}
            ripple="light"
            ref={generateRandomIdentityButtonRef}
          >
            New Identity
            <GenerateRandomIdentityButton buttonRef={generateRandomIdentityButtonRef} />
          </Button>
        </>
      )}
    </>
  )
}

export default function GameById({ jesterId: argJesterId }: { jesterId?: JesterUtils.JesterId }) {
  const { jesterId: paramsJesterId } = useParams<{ jesterId?: JesterUtils.JesterId }>()

  const [jesterId] = useState<JesterUtils.JesterId | undefined>(
    JesterUtils.tryParseJesterId(argJesterId) || JesterUtils.tryParseJesterId(paramsJesterId) || undefined
  )

  const [gameId] = useState<NIP01.EventId | undefined>(
    (jesterId && JesterUtils.jesterIdToGameId(jesterId)) || undefined
  )

  const outgoingNostr = useOutgoingNostrEvents()
  const settings = useSettings()
  const settingsDispatch = useSettingsDispatch()
  const gameStore = useGameStore()

  const [currentChessInstance, setCurrentChessInstance] = useState<ChessInstance | null>(null)
  const [currentGameStart, setCurrentGameStart] = useState<GameStart | null>(null)
  const [currentGameHead, setCurrentGameHead] = useState<JesterMove | null>(null)
  const [color, setColor] = useState<MovableColor>(MOVE_COLOR_NONE)
  const [isSearchingHead, setIsSearchingHead] = useState(true)

  // TODO: "isLoading" is more like "isWaiting",.. e.g. no game is found.. can be in incoming events the next second,
  // in 10 seconds, or never..
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const publicKeyOrNull = settings.identity?.pubkey || null
  const privateKeyOrNull = getSession()?.privateKey || null

  useEffect(() => {
    if (!gameId) return

    const previousTitle = document.title
    let titlePrefix = currentChessInstance && !isSearchingHead ? `${titleMessage(currentChessInstance, color)} – ` : ''
    document.title = `${titlePrefix}Game ${AppUtils.gameDisplayNameShort(gameId)}`

    return () => {
      document.title = previousTitle
    }
  }, [isSearchingHead, gameId, color, currentChessInstance])

  /********************** SUBSCRIBE TO GAME */
  const unsubscribeFromCurrentGame = useCallback(() => {
    settingsDispatch({ currentGameJesterId: undefined } as AppSettings)
  }, [settingsDispatch])

  const subscribeToGame = useCallback(() => {
    if (!jesterId) return
    settingsDispatch({ currentGameJesterId: jesterId } as AppSettings)
  }, [jesterId, settingsDispatch])

  useEffect(() => {
    subscribeToGame()

    return () => {
      // TODO: should the gameId be removed when naviating away?
      // This would also close the subscription!
      // unsubscribeFromCurrentGame()
    }
  }, [subscribeToGame])

  /********************** SUBSCRIBE TO GAME - end */

  const currentGameStartEvent = useLiveQuery(async () => {
    if (!gameId) return

    const event = await gameStore.game_start.get(gameId)
    if (!event) return

    return event
  }, [gameId])

  useEffect(() => {
    setCurrentGameStart((current) => {
      if (!currentGameStartEvent) {
        return null
      }
      if (current && current.event().id === currentGameStartEvent.id) {
        return current
      }
      return new GameStart(currentGameStartEvent)
    })
  }, [currentGameStartEvent])

  const currentGameMoves = useLiveQuery(
    async () => {
      if (!gameId) return []

      const events = await gameStore.game_move.where('gameId').equals(gameId).sortBy('moveCounter')
      return events
    },
    [gameId],
    [] as GameMoveEvent[]
  )

  const onChessboardChanged = async (chessboard: ChessInstance) => {
    if (!currentChessInstance) return

    try {
      await sendGameStateViaNostr(chessboard)
    } catch (e) {
      console.error(e)
    }
  }

  const sendGameStateViaNostr = async (chessboard: ChessInstance) => {
    if (!outgoingNostr) {
      throw new Error('Nostr EventBus not ready..')
    }
    if (!publicKeyOrNull) {
      throw new Error('PubKey not available..')
    }
    if (!privateKeyOrNull) {
      throw new Error('PrivKey not available..')
    }
    if (!currentGameStart || !currentGameHead) {
      throw new Error('Game head not available..')
    }
    const publicKey = publicKeyOrNull!
    const privateKey = privateKeyOrNull!

    const startId = currentGameStart.event().id
    const headId = currentGameHead.event().id

    return await new Promise<NIP01.Event>(function (resolve, reject) {
      setTimeout(async () => {
        try {
          const event = JesterUtils.constructGameMoveEvent(publicKey, startId, headId, chessboard)
          const signedEvent = await NostrEvents.signEvent(event, privateKey)
          outgoingNostr.emit(NIP01.ClientEventType.EVENT, NIP01.createClientEventMessage(signedEvent))
          resolve(signedEvent)
        } catch (e) {
          reject(e)
        }
      }, 1)
    })
  }

  useEffect(() => {
    setColor((_) => {
      if (currentGameStart && privateKeyOrNull !== null && publicKeyOrNull !== null) {
        if (publicKeyOrNull === currentGameStart.event().pubkey) {
          //if (process.env.NODE_ENV === 'development') {
          //  return MOVE_COLOR_BOTH
          //}
          return MOVE_COLOR_WHITE
        } else {
          return MOVE_COLOR_BLACK
        }
      }

      return MOVE_COLOR_NONE
    })
  }, [currentGameStart, privateKeyOrNull, publicKeyOrNull])

  useEffect(() => {
    setCurrentGameHead(currentGameStart)
  }, [currentGameStart])

  useEffect(() => {
    setCurrentChessInstance((current) => {
      if (!currentGameHead) {
        return null
      }

      if (isSearchingHead && current !== null) {
        return current
      }
      const newGame = new Chess.Chess()
      if (isSearchingHead) {
        return newGame
      }

      // TODO: does the "game" really need to change, or can you just do:
      // current.game.load_pgn(history.join('\n'))
      // without returning a copy?
      if (currentGameHead.isStart()) {
        return newGame
      } else {
        const pgn = currentGameHead.pgn()
        const loaded = newGame.load_pgn(pgn)
        if (!loaded) {
          // should not happen as currentGameHead contains a valid pgn
          throw new Error(`Cannot load new game state from pgn: ${pgn}`)
        }

        console.info('loaded new game state from pgn', pgn)
        return newGame
      }
    })
  }, [isSearchingHead, currentGameHead])

  const findChildren = useCallback((move: JesterUtils.JesterMove, moves: GameMoveEvent[]) => {
    const searchParentMoveId = move.isStart() ? null : move.event().id
    return moves.filter((move) => move.parentMoveId === searchParentMoveId)
  }, [])

  const findNextHead = useCallback(
    (currentHead: JesterUtils.JesterMove, moves: GameMoveEvent[]): JesterUtils.JesterMove => {
      const children = findChildren(currentHead, moves)

      if (children.length === 0) {
        return currentHead
      } else {
        children.sort((a, b) => b.created_at - a.created_at)
        const earliestArrivingChild = children[children.length - 1]
        try {
          return new GameMove(earliestArrivingChild, currentHead)
        } catch (err) {
          // this can happen anytime someone sends an event thats not a valid successor to the current head
          console.error(err, earliestArrivingChild.content, currentHead.content())
          return currentHead
        }
      }
    },
    [findChildren]
  )

  useEffect(() => {
    if (!currentGameStart) return
    if (!currentGameHead) return

    console.debug(`Start gathering events referencing current head event ${currentGameHead.event().id}`)

    const newHead = findNextHead(currentGameHead, currentGameMoves)
    setCurrentGameHead(newHead)

    const children = findChildren(newHead, currentGameMoves)
    const stillSearching = children.length > 0
    setIsSearchingHead(stillSearching)

    if (!stillSearching) {
      console.debug('Search for head is over, current head is at the top and has no children.')
    } else {
      console.debug(`Search for head continues. Found ${children.length} event(s) referencing the current head...`)
    }
  }, [currentGameStart, currentGameMoves, currentGameHead, findNextHead, findChildren])

  useEffect(() => {
    const abortCtrl = new AbortController()
    const waitDuration = currentGameStart ? MIN_LOADING_INDICATOR_DURATION_IN_MS : MAX_LOADING_INDICATOR_DURATION_IN_MS

    const timer = setTimeout(() => !abortCtrl.signal.aborted && setIsLoading(false), waitDuration)

    return () => {
      abortCtrl.abort()
      clearTimeout(timer)
    }
  }, [currentGameStart])

  if (!gameId) {
    return <div>Error: GameId not present</div>
  }

  return (
    <div className="screen-game-by-id">
      <div className="flex justify-center items-center">
        <div>
          {!isLoading && currentChessInstance === null ? (
            <div className="my-4">
              <div className="flex justify-between items-center mx-1">
                <div className="text-blue-gray-500 text-3xl font-serif font-bold mt-0 mb-0">Game not found...</div>
                <div className="mx-4">
                  <GameStartOrNewIdentityButton hasPrivateKey={!!privateKeyOrNull} />
                </div>
              </div>
            </div>
          ) : (
            <div className="my-4">
              <div className="flex justify-center items-center mx-1">
                <div>
                  <GameStateMessage
                    isLoading={isLoading || isSearchingHead}
                    game={currentChessInstance}
                    color={color}
                  />
                </div>
              </div>

              {!isLoading && !isSearchingHead && currentChessInstance !== null && currentChessInstance.game_over() && (
                <div className="flex justify-between items-center mx-1">
                  <div className="text-blue-gray-500 text-3xl font-serif font-bold mt-0 mb-0">
                    <GameOverMessage game={currentChessInstance} />
                  </div>
                  <div className="mx-4">
                    <GameStartOrNewIdentityButton hasPrivateKey={!!privateKeyOrNull} />
                  </div>
                </div>
              )}
            </div>
          )}

          <div
            style={{
              filter: settings.currentGameJesterId !== jesterId ? 'brightness(0.5)' : undefined,
            }}
          >
            <GameboardWithLoader
              isLoading={isLoading}
              isSearchingHead={isSearchingHead}
              game={currentChessInstance}
              color={color}
              onChessboardChanged={onChessboardChanged}
            />
          </div>

          {currentChessInstance !== null && (
            <div className="my-4">
              <div className="my-4 flex justify-center items-center">
                <div>
                  <ColorMessage color={color} />
                </div>
              </div>
              {color.length > 0 && currentChessInstance !== null && !currentChessInstance.game_over() && (
                <div className="my-4 flex justify-center items-center">
                  <div>
                    <ProposeTakebackButton disabled={isLoading || isSearchingHead} />
                  </div>
                  <div>
                    <OfferDrawButton disabled={isLoading || isSearchingHead} />
                  </div>
                  <div>
                    <ResignButton disabled={isLoading || isSearchingHead} />
                  </div>
                </div>
              )}

              <div style={{ display: 'none' }}>
                <BotMoveSuggestions game={isLoading || isSearchingHead ? null : currentChessInstance} />
              </div>

              <div className="my-4">
                {currentChessInstance !== null && <CopyGameUrlInput value={window.location.href} />}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ margin: '2.5rem 0' }}></div>

      {settings.dev && (
        <div className="my-4">
          <div className="my-4">
            {settings.currentGameJesterId === jesterId ? (
              <button
                type="button"
                className="bg-white bg-opacity-20 rounded px-2 py-1"
                onClick={() => unsubscribeFromCurrentGame()}
              >
                Unsubscribe
              </button>
            ) : (
              <button
                type="button"
                className="bg-white bg-opacity-20 rounded px-2 py-1"
                onClick={() => subscribeToGame()}
              >
                Subscribe
              </button>
            )}
          </div>

          <div className="my-4">
            <pre className="py-4" style={{ overflowX: 'scroll' }}>
              <div>{`jesterId: ${jesterId}`}</div>
              <div>{`gameId: ${gameId}`}</div>
              <div>{`currentHeadId: ${currentGameHead?.event().id}`}</div>
              <div>{`Moves: ${currentGameMoves.length}`}</div>
              <div>{`isLoading: ${isLoading}`}</div>
              <div>{`isSearchingHead: ${isSearchingHead}`}</div>
              <div>{`currentGameStart: ${currentGameStart?.isStart()}`}</div>
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

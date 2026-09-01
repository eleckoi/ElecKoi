package com.eleckoi.android.engine.agent.eleckoi.conversation

import androidx.paging.PagingSource
import androidx.paging.PagingState
import com.eleckoi.android.foundation.storage.room.agent.dao.AgentPagedTurnRef
import kotlinx.coroutines.CancellationException

internal class MaterializingTurnPagingSource(
    private val delegate: PagingSource<Int, AgentPagedTurnRef>,
    private val materialize: suspend (List<AgentPagedTurnRef>) -> List<PagedConversationTurn>,
) : PagingSource<Int, PagedConversationTurn>() {
    init {
        delegate.registerInvalidatedCallback(::invalidate)
        registerInvalidatedCallback(delegate::invalidate)
    }

    override suspend fun load(params: LoadParams<Int>): LoadResult<Int, PagedConversationTurn> {
        return when (val result = delegate.load(params)) {
            is LoadResult.Page -> try {
                LoadResult.Page(
                    data = materialize(result.data),
                    prevKey = result.prevKey,
                    nextKey = result.nextKey,
                    itemsBefore = result.itemsBefore,
                    itemsAfter = result.itemsAfter,
                )
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                LoadResult.Error(error)
            }
            is LoadResult.Error -> LoadResult.Error(result.throwable)
            is LoadResult.Invalid -> LoadResult.Invalid()
        }
    }

    override fun getRefreshKey(state: PagingState<Int, PagedConversationTurn>): Int? {
        val anchorPosition = state.anchorPosition ?: return null
        val anchorPage = state.closestPageToPosition(anchorPosition) ?: return null
        return anchorPage.prevKey?.plus(anchorPage.data.size)
            ?: anchorPage.nextKey?.minus(anchorPage.data.size)
    }
}

internal const val PagingTurnsPerLoad = 8
internal const val InitialPagingTurns = 8
internal const val PagingPrefetchTurns = 3

